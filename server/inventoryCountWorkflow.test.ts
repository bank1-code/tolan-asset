import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { inventoryCountRouter } from "./routers/inventoryCount";
import { inventoryTimeline } from "./inventoryTimeline";
const context = (role = "accountant", id = 2) =>
  ({
    user: { id, name: role, role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  }) as TrpcContext;
const caller = (role?: string, id?: number) =>
  inventoryCountRouter.createCaller(context(role, id));
beforeEach(() => {
  state.db = transactionDatabase({
    departments: [{ id: 1, name: "المالية" }],
    assets: [
      {
        id: 1,
        assetCode: "A1",
        assetName: "أجهزة",
        quantity: 10,
        excludedQuantity: 3,
        warrantyReplacedQuantity: 1,
        status: "ACTIVE",
        departmentId: 1,
      },
    ],
    custody_items: [
      {
        id: 1,
        code: "C1",
        name: "عهدة",
        quantity: 2,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        status: "ACTIVE",
        departmentId: 1,
      },
    ],
    inventory_sessions: [],
    inventory_differences: [],
    audit_log: [],
    archive_documents: [],
    asset_transfers: [],
    asset_exclusions: [],
    warranty_replacements: [],
    exclusion_attachments: [],
  });
});
const draft = (sessionType: "assets" | "custody" = "assets") =>
  caller().createDraft({ sessionType, departmentId: 1 });
const save = (
  id: number,
  actualQuantity: number | null = 4,
  reason = "نقص قيد المراجعة",
  expectedVersion = 0
) =>
  caller().saveDraft({
    id,
    expectedVersion,
    items: [{ id: 1, actualQuantity, reason }],
  });
const approve = async (id: number, expectedVersion = 1) => {
 const session = state.db.rows().inventory_sessions.find((row: any) => row.id === id);
 if (session?.status === "DRAFT") { const submitted = await caller().submitSession({ id, expectedVersion }); return caller("accounting_manager", 3).approveSession({ id, expectedVersion: submitted.version }); }
 return caller("accounting_manager", 3).approveSession({ id, expectedVersion });
};
describe("Quantity inventory drafts and final approval", () => {
  for (const kind of ["assets", "custody"] as const)
    it(`${kind}: accountant drafts and manager approves without changing stock`, async () => {
      const original = structuredClone(
        state.db.rows()[kind === "assets" ? "assets" : "custody_items"]
      );
      const result = await draft(kind);
      expect(result.items[0].expectedQuantity).toBe(kind === "assets" ? 6 : 2);
      expect(result.status).toBe("DRAFT");
      expect(await caller("accounting_manager").getDifferences()).toEqual([]);
      await save(result.id, 1);
      expect(state.db.rows().archive_documents).toEqual([]);
      await expect(
        caller().approveSession({ id: result.id, expectedVersion: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await approve(result.id)).toMatchObject({ differences: 1 });
      const differences = await caller("accounting_manager").getDifferences();
      expect(differences[0]).toMatchObject({
        expectedQuantity: kind === "assets" ? 6 : 2,
        actualQuantity: 1,
        difference: kind === "assets" ? -5 : -1,
        reason: "نقص قيد المراجعة",
      });
      expect(
        state.db.rows()[kind === "assets" ? "assets" : "custody_items"]
      ).toEqual(original);
      expect(state.db.rows().inventory_sessions[0]).toMatchObject({
        status: "APPROVED",
        approvedBy: 3,
        version: 3,
      });
    });
  it("supports positive quantities and zero counts with reasons", async () => {
    const first = await draft();
    await save(first.id, 8, "زيادة تحتاج مراجعة");
    await approve(first.id);
    const second = await draft();
    await save(second.id, 0, "لم توجد وحدات");
    await approve(second.id);
    expect(
      (await caller("owner").getDifferences()).map(row => row.difference)
    ).toEqual([2, -6]);
  });
  it("does not create differences for matching counts", async () => {
    const result = await draft();
    await save(result.id, 6, "");
    expect((await approve(result.id)).differences).toBe(0);
    expect(state.db.rows().inventory_differences).toEqual([]);
  });
  it("allows incomplete drafts but refuses final approval", async () => {
    const result = await draft();
    await save(result.id, null, "");
    await expect(approve(result.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(state.db.rows().inventory_sessions[0].status).toBe("DRAFT");
  });
  it("requires reasons and rejects negative or fractional counts", async () => {
    const result = await draft();
    for (const [quantity, reason] of [
      [-1, "سبب"],
      [1.5, "سبب"],
    ] as const)
      await expect(save(result.id, quantity, reason)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    expect(state.db.rows().inventory_sessions[0].version).toBe(0);
  });
  it("keeps the baseline snapshot when inventory moves after draft creation", async () => {
    const result = await draft();
    state.db.rows().assets[0].departmentId = 2;
    state.db.rows().assets[0].excludedQuantity = 5;
    await save(result.id, 4, "نُقلت وحدات بعد بدء الجلسة");
    await approve(result.id);
    expect(state.db.rows().inventory_differences[0].expectedQuantity).toBe(6);
    expect(state.db.rows().assets[0].excludedQuantity).toBe(5);
  });
  it("prevents changing draft membership or supplying foreign entity IDs", async () => {
    const result = await draft();
    await expect(
      caller().saveDraft({
        id: result.id,
        expectedVersion: 0,
        items: [{ id: 99, actualQuantity: 6, reason: "" }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().saveDraft({
        id: result.id,
        expectedVersion: 0,
        items: [
          { id: 1, actualQuantity: 6, reason: "" },
          { id: 1, actualQuantity: 6, reason: "" },
        ],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("enforces ownership and hides other accountants' drafts", async () => {
    const result = await draft();
    expect(await caller("accountant", 9).getSessions()).toEqual([]);
    expect(await caller("accounting_manager", 3).getSessions()).toHaveLength(1);
    await expect(
      caller("accountant", 9).saveDraft({
        id: result.id,
        expectedVersion: 0,
        items: [{ id: 1, actualQuantity: 6, reason: "" }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects stale saves, repeated approvals and edits after approval", async () => {
    const result = await draft();
    await save(result.id);
    await expect(save(result.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(approve(result.id, 0)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await approve(result.id);
    await expect(approve(result.id, 2)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(save(result.id, 6, "", 2)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(state.db.rows().inventory_differences).toHaveLength(1);
    expect(state.db.locks).toContain("inventory_sessions:update");
  });
  for (const role of ["accountant", "employee"])
    it(`${role}: cannot inspect differences`, async () => {
      await expect(caller(role).getDifferences()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  for (const role of ["owner", "admin", "accounting_manager"])
    it(`${role}: can finally approve`, async () => {
      const result = await draft();
      await save(result.id);
      const submitted = await caller().submitSession({ id: result.id, expectedVersion: 1 });
      await caller(role, 3).approveSession({
        id: result.id,
        expectedVersion: submitted.version,
      });
      expect(await caller(role).getDifferences()).toHaveLength(1);
    });
  for (const table of [
    "inventory_differences",
    "archive_documents",
    "audit_log",
  ])
    it(`approval fully rolls back on ${table} failure`, async () => {
      const result = await draft();
      await save(result.id);
      await caller().submitSession({ id: result.id, expectedVersion: 1 });
      const before = structuredClone(state.db.rows());
      state.db.failOn(table, table === "audit_log" ? 4 : 1);
      await expect(approve(result.id, 2)).rejects.toThrow("Injected");
      expect(state.db.rows()).toEqual(before);
    });
  it("only approved inventories appear as inventory events in the timeline", async () => {
    const result = await draft();
    await save(result.id);
    expect(
      (await inventoryTimeline(state.db, "asset", 1)).filter(
        row => row.actionType === "INVENTORY"
      )
    ).toHaveLength(0);
    await approve(result.id);
    expect(
      (await inventoryTimeline(state.db, "asset", 1)).filter(
        row => row.actionType === "INVENTORY"
      )
    ).toHaveLength(1);
  });
  it("preserves legacy session results without fabricating quantities", async () => {
    state.db
      .rows()
      .inventory_sessions.push({
        id: 1,
        departmentName: "قديم",
        sessionType: "assets",
        status: "APPROVED",
        items: [{ id: 1, code: "A1", name: "قديم", status: "scanned" }],
      });
    expect(
      (await caller().getSessions())[0].items[0].actualQuantity
    ).toBeNull();
    await expect(approve(1, 0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("records partial processing with immutable original count and documented closure", async () => {
    const result = await draft();
    await save(result.id, 3);
    await approve(result.id);
    const manager = caller("accounting_manager", 3);
    const difference = (await manager.getDifferences())[0];
    const original = structuredClone(state.db.rows().inventory_sessions[0]);
    await manager.recordDifferenceAction({
      differenceId: difference.id,
      actionType: "START",
      quantity: 0,
      note: "بدأت مراجعة المستندات والتحقق من سبب النقص",
    });
    expect((await manager.getDifferences())[0].processingStatus).toBe(
      "IN_PROGRESS"
    );
    state.db
      .rows()
      .asset_exclusions.push({
        id: 1,
        entityType: "asset",
        entityId: 1,
        quantityExcluded: 1,
        exclusionDate: new Date("2026-10-06"),
      });
    await manager.recordDifferenceAction({
      differenceId: difference.id,
      actionType: "EXCLUSION",
      quantity: 1,
      operationId: 1,
      note: "عولجت الوحدة التالفة بالاستبعاد الرسمي المرتبط",
    });
    expect((await manager.getDifferences())[0].remainingQuantity).toBe(2);
    await expect(
      manager.recordDifferenceAction({
        differenceId: difference.id,
        actionType: "EXCLUSION",
        quantity: 1,
        operationId: 1,
        note: "محاولة إعادة احتساب حركة الاستبعاد نفسها",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await manager.recordDifferenceAction({
      differenceId: difference.id,
      actionType: "REVIEW",
      documents: [{ name: "محضر.pdf", url: "/api/files/documents/inventory/report.pdf" }],
      quantity: 2,
      note: "ثبت وجود الوحدتين بمراجعة المحضر والمستندات ولا حاجة لحركة",
    });
    expect((await manager.getDifferences())[0].processingStatus).toBe(
      "RESOLVED"
    );
    expect(state.db.rows().inventory_sessions[0]).toEqual(original);
    await expect(
      manager.recordDifferenceAction({
        differenceId: difference.id,
        actionType: "START",
        quantity: 0,
        note: "محاولة إعادة فتح فرق معالج بالكامل مرة أخرى",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects unrelated and old operations, over-allocation and unauthorized closure", async () => {
    const result = await draft();
    await save(result.id, 4);
    await approve(result.id);
    const manager = caller("accounting_manager", 3),
      differenceId = (await manager.getDifferences())[0].id;
    state.db
      .rows()
      .asset_exclusions.push(
        {
          id: 1,
          entityType: "asset",
          entityId: 99,
          quantityExcluded: 2,
          exclusionDate: new Date("2026-10-06"),
        },
        {
          id: 2,
          entityType: "asset",
          entityId: 1,
          quantityExcluded: 2,
          exclusionDate: new Date("2025-01-01"),
        }
      );
    const input = {
      differenceId,
      actionType: "EXCLUSION" as const,
      quantity: 1,
      operationId: 1,
      note: "ربط حركة بفرق الجرد مع التحقق من هوية الأصل",
    };
    await expect(manager.recordDifferenceAction(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      manager.recordDifferenceAction({ ...input, operationId: 2 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      manager.recordDifferenceAction({
        ...input,
        actionType: "REVIEW",
        operationId: undefined,
        quantity: 3,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().recordDifferenceAction(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("verifies transfer direction from historical audit and rejects employee-only transfers", async () => {
    const result = await draft();
    await save(result.id, 4);
    await approve(result.id);
    const manager = caller("owner"),
      differenceId = (await manager.getDifferences())[0].id;
    state.db
      .rows()
      .asset_transfers.push({
        id: 1,
        entityType: "asset",
        entityId: 1,
        quantity: 2,
        transferredAt: new Date("2026-10-06"),
      });
    state.db
      .rows()
      .audit_log.push({
        id: 90,
        recordId: 1,
        tableName: "asset_transfers",
        actionType: "TRANSFER",
        oldData: { departmentId: 1 },
        newData: { destination: { departmentId: 1 } },
      });
    const input = {
      differenceId,
      actionType: "TRANSFER" as const,
      quantity: 2,
      operationId: 1,
      note: "التحقق من النقل التاريخي المرتبط بفرق الجرد",
    };
    await expect(manager.recordDifferenceAction(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    state.db.rows().audit_log.at(-1).newData.destination.departmentId = 2;
    await manager.recordDifferenceAction(input);
    expect((await manager.getDifferences())[0].processingStatus).toBe(
      "RESOLVED"
    );
  });
  it("records approved additions for positive differences only", async () => {
    const result = await draft();
    await save(result.id, 8, "وحدتان زائدتان تحتاجان توثيقًا");
    await approve(result.id);
    const manager = caller("admin"),
      differenceId = (await manager.getDifferences())[0].id;
    state.db.rows().assets.push({ id: 2, quantity: 2, status: "DRAFT" });
    const input = {
      differenceId,
      actionType: "ADDITION" as const,
      quantity: 2,
      operationId: 2,
      note: "تسجيل الوحدتين الزائدتين في سجل إضافة مستقل معتمد",
    };
    await expect(manager.recordDifferenceAction(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    state.db.rows().assets[1].status = "ACTIVE";
    state.db.rows().assets[1].approvedAt = new Date("2026-10-06");
    await manager.recordDifferenceAction(input);
    expect((await manager.getDifferences())[0].remainingQuantity).toBe(0);
  });
  it("rolls processing back if its audit fails", async () => {
    const result = await draft();
    await save(result.id, 4);
    await approve(result.id);
    const manager = caller("owner"),
      differenceId = (await manager.getDifferences())[0].id;
    const before = structuredClone(state.db.rows());
    state.db.failOn("audit_log", 5);
    await expect(
      manager.recordDifferenceAction({
        differenceId,
        actionType: "REVIEW",
        documents: [{ name: "محضر.pdf", url: "/api/files/documents/inventory/report.pdf" }],
        quantity: 2,
        note: "مراجعة موثقة أثبتت عدم الحاجة إلى حركة جديدة",
      })
    ).rejects.toThrow("Injected");
    expect(state.db.rows()).toEqual(before);
  });
});
