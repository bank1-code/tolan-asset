import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { inventoryRouter } from "./routers/inventory";
import { operationsRouter } from "./routers/operations";
import { recordsRouter } from "./routers/records";
import { inventoryCountRouter } from "./routers/inventoryCount";
import { belongsToInventory } from "./inventoryTimeline";
import { generateArchiveReport } from "../client/src/lib/archiveReport";

const context = (role = "owner") => ({ user: { id: 1, name: "مراجع تاريخي", role }, req: { ip: "127.0.0.1", headers: {} }, res: {} } as TrpcContext);
beforeEach(() => { state.db = transactionDatabase({ assets: [], custody_items: [], audit_log: [], archive_documents: [], inventory_approval_numbers: [],
  locations: [{ id: 1, name: "موقع", assetPrefix: "AST", custodyPrefix: "CUS", assetSequence: 0, custodySequence: 0 }],
  branches: [{ id: 1, locationId: 1 }], departments: [{ id: 1, name: "قسم", branchId: 1 }], employees: [{ id: 1, fullName: "الموظف السابق" }, { id: 2, fullName: "المستلم" }],
  inventory_sessions: [], asset_transfers: [], asset_exclusions: [], exclusion_attachments: [], exclusion_sequence: [], exclusion_drafts: [], exclusion_types: [{ id: 1, name: "تلف" }] }); });

for (const kind of ["asset", "custody"] as const) describe(`${kind}: connected history`, () => {
  const inventory = () => inventoryRouter.createCaller(context())[kind === "asset" ? "assets" : "custody"];
  const exclusions = () => operationsRouter.createCaller(context()).exclusions;
  const records = () => recordsRouter.createCaller(context());
  const payload = (id: number, quantityExcluded = 1) => ({ entityType: kind, entityId: id, quantityExcluded, exclusionMode: "partial" as const, exclusionTypeId: 1, reason: "تلف يحتاج استبعاد", effectiveDate: "2026-10-06", responsibleData: [{ job: "مدير", name: "مراجع المسؤولين" }], exclusionImages: [] });
  const active = async () => {
    const created = await inventory().create({ ...(kind === "asset" ? { assetName: "الاسم الأصلي" } : { name: "الاسم الأصلي" }), quantity: 2, assetValue: "150.00", assignedTo: 1, departmentId: 1, locationId: 1 });
    const result = await inventory().approve({ id: created.id, expectedVersion: 0 }); return { id: created.id, code: result.code };
  };
  const execute = async (id: number, qty = 1) => { const input = payload(id, qty), draft = await exclusions().saveDraft(input); return exclusions().create({ ...input, draftId: draft.id }); };
  it("collects create, approval, transfer, inventory and exclusions once with independent archive snapshots", async () => {
    const { id, code } = await active();
    await operationsRouter.createCaller(context()).transfers.create({ entityType: kind, entityId: id, movementType: "partial", fromEmployeeId: 1, toEmployeeId: 2, toDepartmentId: 1, toLocationId: 1 });
    const counter = inventoryCountRouter.createCaller(context());
    const countDraft = await counter.createDraft({ sessionType: kind === "asset" ? "assets" : "custody", departmentId: 1 });
    const countSaved = await counter.saveDraft({ id: countDraft.id, expectedVersion: 0, items: countDraft.items.map(item => ({ id: item.id, actualQuantity: item.expectedQuantity, reason: "" })) });
    const submittedCount = await counter.submitSession({ id: countDraft.id, expectedVersion: countSaved.version }); await counter.approveSession({ id: countDraft.id, expectedVersion: submittedCount.version });
    const first = await execute(id), second = await execute(id);
    expect(first.record).toMatchObject({ exclusionMode: "partial", originalUnitValue: "150.00", entitySnapshot: { exclusionTypeName: "تلف", employeeName: "المستلم" } });
    expect(second.record).toMatchObject({ exclusionMode: "full", quantityRemaining: 0 });
    const timeline = await records().audit.getTimeline({ entityType: kind, entityId: id });
    expect(timeline.map(event => event.actionType).sort()).toEqual(["APPROVE", "CREATE", "EXCLUDE", "EXCLUDE", "INVENTORY", "TRANSFER"]);
    expect(new Set(timeline.map(event => event.id)).size).toBe(6);
    expect(state.db.rows().archive_documents).toHaveLength(6);
    expect(new Set(state.db.rows().archive_documents.map((doc: any) => doc.sourceKey)).size).toBe(6);
    expect(timeline.find(event => event.actionType === "TRANSFER")?.newData).toMatchObject({ assignedTo: 2, transferSnapshot: { fromEmployeeName: "الموظف السابق", toEmployeeName: "المستلم" } });
    state.db.rows().employees[1].fullName = "اسم جديد";
    expect(state.db.rows().asset_exclusions[0].entitySnapshot.employeeName).toBe("المستلم");
  });
  it("appends a later document without replacing original images or the executed exclusion", async () => {
    const { id } = await active(); const operation = await execute(id);
    const original = structuredClone(state.db.rows().asset_exclusions[0]);
    await exclusions().addAttachment({ exclusionId: operation.id, fileName: "مستند.pdf", url: "/api/files/documents/later.pdf", contentType: "application/pdf" });
    expect(state.db.rows().asset_exclusions[0]).toEqual(original);
    const details = await exclusions().getById({ id: operation.id });
    expect(details.attachments[0]).toMatchObject({ createdBy: 1, createdByName: "مراجع تاريخي" });
    expect(details.audit.map(entry => entry.actionType).sort()).toEqual(["ATTACH", "EXCLUDE"]);
    const timeline = await records().audit.getTimeline({ entityType: kind, entityId: id });
    expect(timeline.filter(event => event.actionType === "ATTACH")).toHaveLength(1);
    await expect(exclusions().addAttachment({ exclusionId: operation.id, fileName: "ثاني.pdf", url: "/api/files/documents/later.pdf", contentType: "application/pdf" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  for (const action of ["transfer", "exclusion", "inventory", "attachment"] as const) it(`${action}: archive failure rolls the complete operation back`, async () => {
    const { id, code } = await active(); let exclusionId = 0;
    if (action === "attachment") exclusionId = (await execute(id)).id;
    let run: () => Promise<any>;
    if (action === "transfer") run = () => operationsRouter.createCaller(context()).transfers.create({ entityType: kind, entityId: id, movementType: "partial", fromEmployeeId: 1, toEmployeeId: 2, toDepartmentId: 1, toLocationId: 1 });
    else if (action === "exclusion") { const input = payload(id), draft = await exclusions().saveDraft(input); run = () => exclusions().create({ ...input, draftId: draft.id }); }
    else if (action === "inventory") { const counter = inventoryCountRouter.createCaller(context()); const draft = await counter.createDraft({ sessionType: kind === "asset" ? "assets" : "custody", departmentId: 1 }); const saved = await counter.saveDraft({ id: draft.id, expectedVersion: 0, items: draft.items.map(item => ({ id: item.id, actualQuantity: item.expectedQuantity, reason: "" })) }); const submitted = await counter.submitSession({ id: draft.id, expectedVersion: saved.version }); run = () => counter.approveSession({ id: draft.id, expectedVersion: submitted.version }); }
    else run = () => exclusions().addAttachment({ exclusionId, fileName: "لاحق.pdf", url: "/api/files/documents/new.pdf", contentType: "application/pdf" });
    const before = structuredClone(state.db.rows());
    state.db.failOn("archive_documents", state.db.rows().archive_documents.length + 1);
    await expect(run()).rejects.toThrow("Injected"); expect(state.db.rows()).toEqual(before);
  });
  it("refuses historical archive and inventory deletion even for owner; employee cannot append attachments or inspect operations", async () => {
    const { id } = await active(); const operation = await execute(id), doc = state.db.rows().archive_documents[0];
    await expect(records().archive.update({ id: doc.id, notes: "تغيير" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(records().archive.delete({ id: doc.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(inventoryCountRouter.createCaller(context()).deleteSession({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(operationsRouter.createCaller(context("employee")).exclusions.getById({ id: operation.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordsRouter.createCaller(context("employee")).audit.getTimeline({ entityType: kind, entityId: id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
it("does not assign each modern group transfer to every group member", () => {
  expect(belongsToInventory({ entityType: "asset", entityId: 2, affectedEntityIds: [1, 2] }, "asset", 1)).toBe(false);
  expect(belongsToInventory({ entityType: "asset", entityId: 0, affectedEntityIds: [1, 2] }, "asset", 1)).toBe(true);
  expect(belongsToInventory({ entityType: "custody", entityId: 1 }, "asset", 1)).toBe(false);
  expect(belongsToInventory('{"assetId":1}', "asset", 1)).toBe(true);
  expect(belongsToInventory("bad-json", "asset", 1)).toBe(false);
});
it("prints stored snapshots and escapes names instead of reading current inventory", () => {
  const html = generateArchiveReport({ id: 1, documentTitle: "<script>title</script>", createdAt: new Date(), operationType: "اعتماد", snapshot: { newData: { assetName: "الاسم التاريخي", assetValue: "150.00" }, performedByName: "المراجع" } });
  expect(html).toContain("الاسم التاريخي"); expect(html).toContain("150.00"); expect(html).not.toContain("<script>");
  expect(generateArchiveReport({ id: 2, createdAt: new Date(), documentTitle: "قديم", operationType: "إضافة" })).toContain("لا توجد نسخة بيانات تاريخية كاملة");
});
