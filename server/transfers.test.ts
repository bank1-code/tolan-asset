import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { transactionDatabase } from "./test-utils/transactionDatabase";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./security", () => ({ logAuditAction: vi.fn() }));
import { operationsRouter } from "./routers/operations";

describe("Historical transfer integrity", () => {
  const ctx = { user: { id: 1, name: "مسؤول النظام", role: "owner" }, req: { ip: "127.0.0.1", headers: { "user-agent": "test" } }, res: {} } as TrpcContext;
  const input = { entityType: "asset" as const, entityId: 1, movementType: "partial" as const, fromEmployeeId: 10,
    toEmployeeId: 20, toDepartmentId: 200, toLocationId: 2000 };
  const caller = () => operationsRouter.createCaller(ctx).transfers;
  const initial = () => ({
    assets: [{ id: 1, assetName: "حاسب تاريخي", assetCode: "A1", quantity: 10, excludedQuantity: 3, assetValue: "500.00", status: "ACTIVE", assignedTo: 10, departmentId: 100, locationId: 1000 }],
    custody_items: [{ id: 1, name: "عهدة تاريخية", code: "C1", quantity: 10, excludedQuantity: 3, assetValue: "300.00", status: "ACTIVE", assignedTo: 10, departmentId: 100, locationId: 1000 }],
    employees: [{ id: 10, fullName: "المسؤول السابق" }, { id: 20, fullName: "المسؤول الجديد" }],
    departments: [{ id: 100, name: "القسم القديم", branchId: 1 }, { id: 200, name: "القسم الجديد", branchId: 2 }],
    branches: [{ id: 1, locationId: 1000, name: "الفرع القديم" }, { id: 2, locationId: 2000, name: "الفرع الجديد" }],
    locations: [{ id: 1000, name: "الموقع القديم" }, { id: 2000, name: "الموقع الجديد" }],
    asset_transfers: [], audit_log: [],
  });
  beforeEach(() => { state.db = transactionDatabase(initial()); });

  for (const entityType of ["asset", "custody"] as const) {
    it(`${entityType}: locks inventory and records actual remaining quantity with audit`, async () => {
      const result = await caller().create({ ...input, entityType });
      const rows = state.db.rows();
      expect(rows[entityType === "asset" ? "assets" : "custody_items"][0]).toMatchObject({ assignedTo: 20, departmentId: 200, locationId: 2000, quantity: 10, excludedQuantity: 3, status: "ACTIVE" });
      expect(result).toMatchObject({ count: 1, quantityMoved: 7, affectedEntityIds: [1] });
      expect(rows.asset_transfers[0]).toMatchObject({ fromEmployeeId: 10, toEmployeeId: 20, fromDepartment: "القسم القديم", fromLocation: "الموقع القديم", quantity: 7 });
      expect(rows.audit_log[0]).toMatchObject({ recordId: result.id, actionType: "TRANSFER", performedBy: 1 });
      expect(rows.audit_log[0].oldData).toMatchObject({ assignedTo: 10 });
      expect(rows.audit_log[0].newData).toMatchObject({ entityType, entityId: 1, transferSnapshot: { fromEmployeeName: "المسؤول السابق", toEmployeeName: "المسؤول الجديد" } });
      expect(state.db.locks).toContain(`${entityType === "asset" ? "assets" : "custody_items"}:update`);
    });
    it(`${entityType}: rejects excluded and empty individual records`, async () => {
      const row = state.db.rows()[entityType === "asset" ? "assets" : "custody_items"][0];
      row.status = "EXCLUDED";
      await expect(caller().create({ ...input, entityType })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      row.status = "ACTIVE"; row.excludedQuantity = 10;
      await expect(caller().create({ ...input, entityType })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(state.db.rows().asset_transfers).toHaveLength(0);
    });
    it(`${entityType}: total transfer leaves excluded/empty/other employees' records unchanged`, async () => {
      const name = entityType === "asset" ? "assets" : "custody_items";
      const rows = state.db.rows()[name], first = rows[0];
      rows.push({ ...first, id: 2, status: "EXCLUDED" }, { ...first, id: 3, excludedQuantity: 10 }, { ...first, id: 4, assignedTo: 30 }, { ...first, id: 5, quantity: 4, excludedQuantity: 1 });
      const result = await caller().create({ ...input, entityType, movementType: "total" });
      expect(result).toMatchObject({ count: 2, quantityMoved: 10, affectedEntityIds: [1, 5] });
      expect(rows.filter((row: any) => [2, 3, 4].includes(row.id)).map((row: any) => row.assignedTo)).toEqual([10, 10, 30]);
      expect(state.db.rows().asset_transfers.map((row: any) => row.entityId)).toEqual([1, 5]);
      expect(state.db.rows().audit_log).toHaveLength(2);
    });
  }
  it("rejects stale source and repeated execution", async () => {
    await expect(caller().create({ ...input, fromEmployeeId: 30 })).rejects.toMatchObject({ code: "CONFLICT" });
    await caller().create(input);
    await expect(caller().create(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.db.rows().asset_transfers).toHaveLength(1);
  });
  it("rejects unchanged assignment, missing receiver and inconsistent destination", async () => {
    await expect(caller().create({ ...input, toEmployeeId: 10, toDepartmentId: 100, toLocationId: 1000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().create({ ...input, toEmployeeId: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().create({ ...input, toLocationId: 1000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().asset_transfers).toHaveLength(0);
  });
  it("requires a source for total transfer and rejects unsupported item baskets", async () => {
    await expect(caller().create({ ...input, movementType: "total", fromEmployeeId: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().create({ ...input, items: [{ entityId: 1 }] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().create({ ...input, fromEmployeeId: undefined } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("allows relocation for the same employee and audits only actual changes", async () => {
    await caller().create({ ...input, toEmployeeId: 10 });
    expect(state.db.rows().audit_log[0].changedFields).toEqual(["departmentId", "locationId"]);
  });
  it("rejects an empty total transfer and a nonexistent source", async () => {
    state.db.rows().assets[0].status = "EXCLUDED";
    await expect(caller().create({ ...input, movementType: "total" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().create({ ...input, movementType: "total", fromEmployeeId: 999 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().asset_transfers).toHaveLength(0);
  });
  it("rejects a destination whose referenced location no longer exists", async () => {
    state.db.rows().locations = state.db.rows().locations.filter((row: any) => row.id !== 2000);
    await expect(caller().create(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.db.rows().assets[0].assignedTo).toBe(10);
    expect(state.db.rows().asset_transfers).toHaveLength(0);
  });
  for (const table of ["asset_transfers", "assets", "audit_log"]) {
    it(`failure writing ${table} rolls back movement, assignment and audit`, async () => {
      const before = structuredClone(state.db.rows());
      state.db.failOn(table);
      await expect(caller().create(input)).rejects.toThrow(`Injected ${table} failure`);
      expect(state.db.rows()).toEqual(before);
    });
  }
  it("a late bulk audit failure rolls back every earlier transfer in the group", async () => {
    state.db.rows().assets.push({ ...state.db.rows().assets[0], id: 2 });
    const before = structuredClone(state.db.rows());
    state.db.failOn("audit_log", 2);
    await expect(caller().create({ ...input, movementType: "total" })).rejects.toThrow("Injected audit_log failure");
    expect(state.db.rows()).toEqual(before);
  });
  it("blocks historical edits through the API", async () => {
    const result = await caller().create(input);
    const before = structuredClone(state.db.rows());
    await expect(caller().update({ id: result.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.rows()).toEqual(before);
  });
  it("details and list retain saved names after source data is renamed", async () => {
    const result = await caller().create(input);
    state.db.rows().employees[0].fullName = "اسم مختلف";
    state.db.rows().employees[1].fullName = "اسم مستلم مختلف";
    state.db.rows().assets[0].assetName = "اسم أصل مختلف";
    for (const record of [await caller().getById({ id: result.id }), (await caller().list())[0]]) {
      expect(record).toMatchObject({ entityName: "حاسب تاريخي", entityCode: "A1", fromEmployeeName: "المسؤول السابق", toEmployeeName: "المسؤول الجديد", historicalSnapshot: true });
    }
  });
  it("ignores client-supplied quantity/value/source names and uses locked data", async () => {
    await caller().create({ ...input, quantity: 999, assetValue: "999", fromDepartment: "مزور" } as any);
    expect(state.db.rows().asset_transfers[0]).toMatchObject({ quantity: 7, assetValue: "500.00", fromDepartment: "القسم القديم" });
  });
  it("employees cannot execute transfers", async () => {
    const employee = operationsRouter.createCaller({ ...ctx, user: { ...ctx.user!, role: "employee" } });
    await expect(employee.transfers.create(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.db.rows().asset_transfers).toHaveLength(0);
  });
});
