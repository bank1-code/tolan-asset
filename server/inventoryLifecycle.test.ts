import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { inventoryRouter } from "./routers/inventory";
import { operationsRouter } from "./routers/operations";
import { inventoryCountRouter } from "./routers/inventoryCount";

const context = (role = "owner") => ({ user: { id: 1, name: "المختص", role }, req: { ip: "127.0.0.1", headers: {} }, res: {} } as TrpcContext);
beforeEach(() => { state.db = transactionDatabase({ assets: [], custody_items: [], audit_log: [], archive_documents: [],
  locations: [{ id: 1, name: "موقع", assetPrefix: "AST", custodyPrefix: "CUS", assetSequence: 0, custodySequence: 0 }],
  branches: [{ id: 1, locationId: 1 }], departments: [{ id: 1, branchId: 1 }], employees: [{ id: 1, fullName: "مستلم" }, { id: 2, fullName: "مستلم آخر" }], inventory_approval_numbers: [], inventory_sessions: [], asset_transfers: [], asset_exclusions: [] }); });
for (const kind of ["asset", "custody"] as const) {
  const table = kind === "asset" ? "assets" : "custody_items";
  const data = () => ({ ...(kind === "asset" ? { assetName: "حاسب" } : { name: "حاسب" }), quantity: 2, assetValue: "500.25", assignedTo: 1, departmentId: 1, locationId: 1 });
  const caller = (role = "owner") => inventoryRouter.createCaller(context(role))[kind === "asset" ? "assets" : "custody"];
  const create = () => caller().create(data());
  describe(`${kind}: draft approval and lock`, () => {
    it("creates an editable draft without allocating a number or changing the location sequence", async () => {
      const result = await create();
      expect(result.status).toBe("DRAFT");
      expect(state.db.rows()[table][0]).toMatchObject({ status: "DRAFT", draftVersion: 0 });
      expect(state.db.rows()[table][0][kind === "asset" ? "assetCode" : "code"]).toBeNull();
      expect(state.db.rows().locations[0].assetSequence).toBe(0);
      expect(state.db.rows().archive_documents).toHaveLength(1);
      expect(state.db.rows().audit_log[0]).toMatchObject({ actionType: "CREATE", recordId: result.id });
    });
    it("allows incomplete drafts but requires complete assignment before approval", async () => {
      const result = await caller().create(kind === "asset" ? { assetName: "مسودة" } : { name: "مسودة" });
      await expect(caller().approve({ id: result.id, expectedVersion: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(state.db.rows()[table][0].status).toBe("DRAFT");
    });
    it("updates draft data and rejects stale approval and stale edits", async () => {
      const { id } = await create();
      await caller().update({ ...data(), id, expectedVersion: 0, quantity: 3 });
      await expect(caller().approve({ id, expectedVersion: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(caller().update({ ...data(), id, expectedVersion: 0 })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(state.db.rows()[table][0].quantity).toBe(3);
    });
    it("approval allocates a number, freezes a snapshot and writes archive and audit in the transaction", async () => {
      const { id } = await create();
      const approved = await caller().approve({ id, expectedVersion: 0 });
      expect(approved.code).toMatch(kind === "asset" ? /^AST-/ : /^CUS-/);
      expect(state.db.rows()[table][0]).toMatchObject({ status: "ACTIVE", originLocationId: 1, approvedBy: 1,
        approvalSnapshot: { quantity: 2, approvedByName: "المختص", assetValue: "500.25" } });
      expect(state.db.rows().archive_documents).toHaveLength(2);
      expect(state.db.rows().inventory_approval_numbers[0]).toMatchObject({ entityType: kind, entityId: id, code: approved.code });
      expect(state.db.rows().audit_log.at(-1).actionType).toBe("APPROVE");
      expect(state.db.locks).toContain(`${table}:update`);
      expect(state.db.locks).toContain("locations:update");
      await expect(caller().approve({ id, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller().update({ ...data(), id, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller().cancelDraft({ id, expectedVersion: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("accountant can save drafts but cannot approve or return review comments", async () => {
      const { id } = await caller("accountant").create(data());
      await expect(caller("accountant").approve({ id, expectedVersion: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller("accountant").requestChanges({ id, expectedVersion: 0, note: "تعديل" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller("employee").create(data())).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("keeps review notes and soft cancellation with an audit, denies physical deletion", async () => {
      const { id } = await create();
      await caller().requestChanges({ id, expectedVersion: 0, note: "صحح القيمة" });
      expect(state.db.rows()[table][0]).toMatchObject({ reviewNote: "صحح القيمة", status: "DRAFT", draftVersion: 1 });
      await caller().cancelDraft({ id, expectedVersion: 1 });
      expect(state.db.rows()[table][0].status).toBe("CANCELLED");
      await expect(caller().delete({ id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(state.db.rows()[table]).toHaveLength(1);
    });
    for (const failingTable of ["audit_log", "archive_documents", "inventory_approval_numbers"]) {
      it(`rolls back approval and number allocation when ${failingTable} fails`, async () => {
        const { id } = await create();
        state.db.failOn(failingTable, ["audit_log", "archive_documents"].includes(failingTable) ? 2 : 1);
        await expect(caller().approve({ id, expectedVersion: 0 })).rejects.toThrow("Injected");
        expect(state.db.rows()[table][0]).toMatchObject({ status: "DRAFT", draftVersion: 0 });
        expect(state.db.rows().locations[0][kind === "asset" ? "assetSequence" : "custodySequence"]).toBe(0);
        expect(state.db.rows().archive_documents).toHaveLength(1);
        expect(state.db.rows().inventory_approval_numbers).toHaveLength(0);
        expect(state.db.rows().audit_log).toHaveLength(1);
      });
    }
    it("rolls back draft creation if its audit cannot be saved", async () => {
      state.db.failOn("audit_log");
      await expect(create()).rejects.toThrow("Injected");
      expect(state.db.rows()[table]).toHaveLength(0);
    });
    it("locks existing operational records without pretending they were newly approved", async () => {
      state.db.rows()[table].push({ id: 5, ...data(), status: "ACTIVE", draftVersion: 0, approvedAt: null });
      await expect(caller().update({ ...data(), id: 5, expectedVersion: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(state.db.rows()[table][0].approvedAt).toBeNull();
    });
    it("rejects forged official code, status and invalid quantity/value", async () => {
      await expect(caller().create({ ...data(), status: "ACTIVE" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller().create({ ...data(), [kind === "asset" ? "assetCode" : "code"]: "FORGED" } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller().create({ ...data(), quantity: 1.5 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(caller().create({ ...data(), assetValue: "-10" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("rejects inventory sessions that reference a draft", async () => {
      const { id } = await create();
      await expect(inventoryCountRouter.createCaller(context()).createDraft({ sessionType: kind === "asset" ? "assets" : "custody", departmentId: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(state.db.rows().inventory_sessions).toHaveLength(0);
    });
    it("rejects transfer of a draft", async () => {
      const { id } = await create();
      await expect(operationsRouter.createCaller(context()).transfers.create({ entityType: kind, entityId: id, movementType: "partial", fromEmployeeId: 1, toEmployeeId: 2, toDepartmentId: 1, toLocationId: 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
    it("allocates different official codes on successive approvals", async () => {
      const first = await create(), second = await create();
      const a = await caller().approve({ id: first.id, expectedVersion: 0 });
      const b = await caller().approve({ id: second.id, expectedVersion: 0 });
      expect(a.code).not.toBe(b.code);
      expect(state.db.rows().inventory_approval_numbers).toHaveLength(2);
    });
    it("does not expose drafts or cancelled drafts to the assigned employee", async () => {
      const { id } = await create();
      const employeeContext = context("employee"); employeeContext.user!.employeeId = 1;
      const reader = inventoryRouter.createCaller(employeeContext)[kind === "asset" ? "assets" : "custody"];
      expect(await reader.list()).toHaveLength(0);
      await expect(reader.getById({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await caller().approve({ id, expectedVersion: 0 });
      expect(await reader.list()).toHaveLength(1);
    });
    it("rejects changed assignment during approval", async () => {
      const { id } = await create();
      state.db.rows().branches[0].locationId = 99;
      await expect(caller().approve({ id, expectedVersion: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(state.db.rows().inventory_approval_numbers).toHaveLength(0);
    });
    it("validates current inventory and rolls its session back if the audit fails", async () => {
      const { id } = await create();
      const { code } = await caller().approve({ id, expectedVersion: 0 });
      const counter = inventoryCountRouter.createCaller(context());
      const input = { sessionType: kind === "asset" ? "assets" as const : "custody" as const, departmentId: 1 };
      state.db.failOn("audit_log", 3);
      await expect(counter.createDraft(input)).rejects.toThrow("Injected");
      expect(state.db.rows().inventory_sessions).toHaveLength(0);
      const draft = await counter.createDraft(input);
      const saved = await counter.saveDraft({ id: draft.id, expectedVersion: 0, items: draft.items.map(item => ({ id: item.id, actualQuantity: item.expectedQuantity, reason: "" })) });
      const submitted = await counter.submitSession({ id: draft.id, expectedVersion: saved.version }); await counter.approveSession({ id: draft.id, expectedVersion: submitted.version });
      expect(state.db.rows().inventory_sessions[0]).toMatchObject({ totalCount: 1, scannedCount: 1, missingCount: 0, status: "APPROVED", items: [{ id, code, name: "حاسب", status: "scanned" }] });
    });
  });
}
