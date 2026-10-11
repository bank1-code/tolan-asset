import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import { remainingQuantity } from "../shared/inventoryQuantity";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { warrantyRouter, warrantyPayload } from "./warrantyRouter";
import { operationsRouter } from "./routers/operations";
import { inventoryCountRouter } from "./routers/inventoryCount";
import { inventoryTimeline } from "./inventoryTimeline";
import { generateArchiveReport } from "../client/src/lib/archiveReport";
const context = (role = "owner", id = 1) =>
  ({
    user: { id, name: "معتمد الضمان", role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  }) as TrpcContext;
const caller = (role = "owner", id = 1) =>
  warrantyRouter.createCaller(context(role, id));
const payload = (entityType: "asset" | "custody" = "asset", quantity = 2) => ({
  entityType,
  entityId: 1,
  quantity,
  provider: "الوكيل",
  claimReference: "CL-001",
  reason: "عطل مصنعي",
  incidentDate: "2026-09-01",
  effectiveDate: "2026-10-05",
  originalWarrantyStart: "2026-01-01",
  originalWarrantyEnd: "2027-01-01",
  warrantyPolicy: "continued" as const,
  replacementWarrantyStart: "2026-01-01",
  replacementWarrantyEnd: "2027-01-01",
  originalSerialNumbers: Array.from({ length: quantity }, (_, i) => `OLD-${i}`),
  replacementSerialNumbers: Array.from(
    { length: quantity },
    (_, i) => `NEW-${i}`
  ),
  replacementName: "طراز بديل",
  documents: [
    { name: "محضر.pdf", url: "/api/files/documents/warranty/proof.pdf" },
  ],
  notes: "تم الاستلام",
});
beforeEach(() => {
  state.db = transactionDatabase({
    assets: [
      {
        id: 1,
        assetName: "الجهاز السابق",
        assetCode: "A1",
        quantity: 10,
        excludedQuantity: 2,
        warrantyReplacedQuantity: 1,
        assetValue: "500.00",
        status: "ACTIVE",
        assignedTo: 1,
        departmentId: 1,
        locationId: 1,
      },
    ],
    custody_items: [
      {
        id: 1,
        name: "العهدة السابقة",
        code: "C1",
        quantity: 10,
        excludedQuantity: 2,
        warrantyReplacedQuantity: 1,
        assetValue: "500.00",
        status: "ACTIVE",
        assignedTo: 1,
        departmentId: 1,
        locationId: 1,
      },
    ],
    locations: [
      {
        id: 1,
        name: "موقع",
        assetPrefix: "AST",
        custodyPrefix: "CUS",
        assetSequence: 0,
        custodySequence: 0,
      },
    ],
    branches: [{ id: 1, locationId: 1 }],
    departments: [{ id: 1, name: "قسم", branchId: 1 }],
    employees: [{ id: 1, fullName: "المستلم" }],
    warranty_replacements: [],
    inventory_approval_numbers: [],
    archive_documents: [],
    audit_log: [],
    asset_transfers: [],
    asset_exclusions: [],
    exclusion_drafts: [],
    exclusion_sequence: [],
    exclusion_attachments: [],
    inventory_sessions: [],
    exclusion_types: [{ id: 1, name: "تلف" }],
  });
});
async function submitted(input = payload()) {
  const saved = await caller().saveDraft({ request: input });
  await caller().submit({ id: saved.id, expectedVersion: saved.version });
  return { id: saved.id, expectedVersion: saved.version + 1 };
}

for (const kind of ["asset", "custody"] as const)
  describe(`${kind}: warranty replacement`, () => {
    const table = kind === "asset" ? "assets" : "custody_items";
    it("inherits the classification without changing source value or quantity", async () => {
      state.db.rows()[table][0].classificationId = 7;
      state.db.rows().financial_classifications = [{ id: 7, name: "تصنيف", active: true }];
      const request = await submitted(payload(kind));
      await caller("accounting_manager").execute(request);
      expect(state.db.rows()[table][1]).toMatchObject({ classificationId: 7, assetValue: "500.00", quantity: 2 });
      expect(state.db.rows()[table][0].quantity).toBe(10);
    });
    it("draft and submission persist without affecting quantities or allocating a number", async () => {
      const before = structuredClone(state.db.rows()[table]);
      const saved = await caller("accountant").saveDraft({
        request: payload(kind),
      });
      expect((await caller().list())[0]).toMatchObject({
        status: "DRAFT",
        version: 0,
      });
      await caller().submit({ id: saved.id, expectedVersion: 0 });
      expect(state.db.rows()[table]).toEqual(before);
      expect(state.db.rows().inventory_approval_numbers).toHaveLength(0);
      expect(
        state.db.rows().warranty_replacements[0].operationCode
      ).toBeUndefined();
    });
    it("partial replacement preserves original quantity and exclusions and creates an approved linked replacement", async () => {
      const request = await submitted(payload(kind));
      const result = await caller().execute(request);
      const [old, replacement] = state.db.rows()[table];
      expect(old).toMatchObject({
        quantity: 10,
        excludedQuantity: 2,
        warrantyReplacedQuantity: 3,
        status: "ACTIVE",
      });
      expect(remainingQuantity(old)).toBe(5);
      expect(replacement).toMatchObject({
        quantity: 2,
        assetValue: "500.00",
        assignedTo: 1,
        status: "ACTIVE",
        serialNumbers: ["NEW-0", "NEW-1"],
        warrantyEndDate: "2027-01-01",
        approvalSnapshot: {
          sourceEntityId: 1,
          operationCode: result.operationCode,
        },
      });
      expect(state.db.rows().warranty_replacements[0]).toMatchObject({
        status: "EXECUTED",
        replacementEntityId: 2,
        operationCode: result.operationCode,
        executionSnapshot: { quantityBefore: 7, quantityRemaining: 5 },
      });
      expect(state.db.rows().asset_exclusions).toHaveLength(0);
      expect(state.db.rows().inventory_approval_numbers).toHaveLength(1);
      const timeline = await inventoryTimeline(state.db, kind, 1);
      expect(
        timeline.filter(event => event.actionType === "WARRANTY")
      ).toHaveLength(1);
      const replacementTimeline = await inventoryTimeline(state.db, kind, 2);
      expect(replacementTimeline).toHaveLength(1);
      expect(replacementTimeline[0].newData.sourceEntityCode).toBe(
        kind === "asset" ? "A1" : "C1"
      );
      expect(state.db.rows().archive_documents).toHaveLength(4);
    });
    it("replacing the entire actual remainder closes the previous record as REPLACED", async () => {
      const request = await submitted(payload(kind, 7));
      await caller().execute(request);
      expect(state.db.rows()[table][0]).toMatchObject({
        status: "REPLACED",
        warrantyReplacedQuantity: 8,
        excludedQuantity: 2,
        quantity: 10,
      });
      expect(remainingQuantity(state.db.rows()[table][0])).toBe(0);
      await expect(
        caller().saveDraft({ request: payload(kind) })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("executed requests cannot be replayed, edited, canceled or returned for correction", async () => {
      const request = await submitted(payload(kind));
      await caller().execute(request);
      const before = structuredClone(state.db.rows());
      await expect(caller().execute(request)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await expect(
        caller().saveDraft({
          request: payload(kind),
          id: request.id,
          expectedVersion: 2,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller().cancel({ id: request.id, expectedVersion: 2 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(
        caller().returnForCorrection({
          id: request.id,
          expectedVersion: 2,
          note: "تغيير",
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(state.db.rows()).toEqual(before);
    });
    it("rejects repeated replacement of an already replaced unit", async () => {
      const request = await submitted(payload(kind));
      await caller().execute(request);
      await expect(
        caller().saveDraft({ request: payload(kind) })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
describe("warranty guards and transaction rollback", () => {
  it("rejects nonoperators and restricts execution to owner/admin", async () => {
    await expect(caller("employee").list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const request = await submitted();
    await expect(caller("accountant").execute(request)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller("accountant", 2).cancel(request)).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
  });
  it("rejects quantities beyond the actual remainder and nonactive inventory", async () => {
    await expect(
      caller().saveDraft({ request: payload("asset", 8) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    for (const status of ["DRAFT", "CANCELLED", "EXCLUDED", "REPLACED"]) {
      state.db.rows().assets[0].status = status;
      await expect(
        caller().saveDraft({ request: payload() })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("requires re-review after an assignment change and detects stale request versions", async () => {
    const request = await submitted();
    state.db.rows().assets[0].assetValue = "700.00";
    await expect(caller().execute(request)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await caller().returnForCorrection({ ...request, note: "راجع القيمة" });
    await expect(caller().submit(request)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await caller().submit({ id: request.id, expectedVersion: 2 });
    await caller().execute({ id: request.id, expectedVersion: 3 });
  });
  it("rechecks the remainder at execution after another operation consumes it", async () => {
    const request = await submitted();
    state.db.rows().assets[0].excludedQuantity = 9;
    await expect(caller().execute(request)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(state.db.rows().assets).toHaveLength(1);
  });
  for (const [table, attempt] of [
    ["audit_log", 3],
    ["archive_documents", 3],
    ["archive_documents", 4],
    ["audit_log", 4],
    ["inventory_approval_numbers", 1],
    ["warranty_replacements", 3],
  ] as const)
    it(`rolls back numbering, both records and history on ${table} failure`, async () => {
      const request = await submitted();
      const before = structuredClone(state.db.rows());
      state.db.failOn(table, attempt);
      await expect(caller().execute(request)).rejects.toThrow("Injected");
      expect(state.db.rows()).toEqual(before);
    });
  it("remaining stock is used by exclusion, transfer and inventory after replacement", async () => {
    const request = await submitted();
    await caller().execute(request);
    const exclusion = operationsRouter.createCaller(context()).exclusions;
    const input = {
      entityType: "asset" as const,
      entityId: 1,
      quantityExcluded: 6,
      exclusionTypeId: 1,
      reason: "تلف يحتاج الاستبعاد",
      effectiveDate: "2026-10-05",
      responsibleData: [{ job: "مدير", name: "مسؤول" }],
      exclusionImages: [],
    };
    const draft = await exclusion.saveDraft(input);
    await expect(
      exclusion.create({ ...input, draftId: draft.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const full = await caller().saveDraft({
      request: {
        ...payload("asset", 5),
        originalSerialNumbers: ["O2", "O3", "O4", "O5", "O6"],
      },
    });
    await caller().submit({ id: full.id, expectedVersion: 0 });
    await caller().execute({ id: full.id, expectedVersion: 1 });
    const count = await inventoryCountRouter.createCaller(context()).createDraft({ sessionType: "assets", departmentId: 1 });
    expect(count.items.some(item => item.id === 1)).toBe(false);
  });
  it("transfers only the units still held after a warranty replacement", async () => {
    await caller().execute(await submitted());
    state.db.rows().employees.push({ id: 2, fullName: "المستلم الجديد" });
    const transfer = await operationsRouter
      .createCaller(context())
      .transfers.create({
        entityType: "asset",
        entityId: 1,
        movementType: "partial",
        fromEmployeeId: 1,
        toEmployeeId: 2,
        toDepartmentId: 1,
        toLocationId: 1,
      });
    expect(transfer.quantityMoved).toBe(5);
    expect(state.db.rows().asset_transfers[0].quantity).toBe(5);
    expect(state.db.rows().assets[1].assignedTo).toBe(1);
  });
  it("excludes the actual remainder without reclassifying warranty units as exclusions", async () => {
    await caller().execute(await submitted());
    const api = operationsRouter.createCaller(context()).exclusions;
    const input = {
      entityType: "asset" as const,
      entityId: 1,
      quantityExcluded: 5,
      exclusionTypeId: 1,
      reason: "تلف الكمية المتبقية",
      effectiveDate: "2026-10-05",
      responsibleData: [{ job: "مدير", name: "مسؤول" }],
      exclusionImages: [],
    };
    const draft = await api.saveDraft(input);
    const result = await api.create({ ...input, draftId: draft.id });
    expect(result.record).toMatchObject({
      quantityBefore: 5,
      quantityRemaining: 0,
      exclusionMode: "full",
      entitySnapshot: { warrantyReplacedQuantity: 3 },
    });
    expect(state.db.rows().assets[0]).toMatchObject({
      status: "EXCLUDED",
      quantity: 10,
      excludedQuantity: 7,
      warrantyReplacedQuantity: 3,
    });
  });
  it.each([
    { incidentDate: "2025-01-01" },
    { originalWarrantyEnd: "2026-02-30" },
    { documents: [] },
    { originalSerialNumbers: ["same", "same"] },
    { replacementSerialNumbers: ["OLD-0", "NEW-1"] },
    { replacementWarrantyEnd: "2028-01-01" },
    { quantity: 1.5 },
    { documents: [{ name: "bad", url: "javascript:alert(1)" }] },
  ])("validates proof, dates, policy and per-unit identities: %j", change =>
    expect(warrantyPayload.safeParse({ ...payload(), ...change }).success).toBe(
      false
    )
  );
  it("accepts renewed warranty supported by new dates and validates known source warranty", async () => {
    const renewed = {
      ...payload(),
      warrantyPolicy: "renewed" as const,
      replacementWarrantyStart: "2026-10-05",
      replacementWarrantyEnd: "2028-10-05",
    };
    const request = await submitted(renewed as any);
    await caller().execute(request);
    expect(state.db.rows().assets[1].warrantyEndDate).toBe("2028-10-05");
    state.db.rows().assets[0].warrantyEndDate = "2026-12-31";
    await expect(
      caller().saveDraft({ request: payload() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("prints frozen replacement identity and safe document links", () => {
    const html = generateArchiveReport({
      id: 1,
      createdAt: new Date(),
      documentTitle: "ضمان",
      snapshot: {
        newData: {
          ...payload(),
          operationCode: "WRP-1",
          replacementCode: "AST-2",
          provider: "<script>bad</script>",
        },
      },
    });
    expect(html).toContain("AST-2");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("/api/files/documents/warranty/proof.pdf");
    expect(html).toContain("تاريخ استلام البديل");
  });
});
