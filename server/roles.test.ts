import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./security", () => ({ logAuditAction: vi.fn() }));
import { inventoryRouter } from "./routers/inventory";
import { warrantyRouter } from "./warrantyRouter";
import { localAuthRouter } from "./routers/localAuth";
import { backupRouter } from "./routers/backup";
const context = (role: string, id = 1) =>
  ({
    user: { id, role, name: role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  }) as TrpcContext;
beforeEach(() => {
  state.db = transactionDatabase({
    assets: [],
    custody_items: [],
    users: [],
    locations: [
      {
        id: 1,
        name: "موقع",
        assetPrefix: "A",
        custodyPrefix: "C",
        assetSequence: 0,
        custodySequence: 0,
      },
    ],
    branches: [{ id: 1, locationId: 1 }],
    departments: [{ id: 1, name: "قسم", branchId: 1 }],
    employees: [{ id: 1, fullName: "المستلم" }],
    audit_log: [],
    archive_documents: [],
    inventory_approval_numbers: [],
    warranty_replacements: [],
  });
});
describe("Accounting manager approval boundaries", () => {
  for (const kind of ["assets", "custody"] as const)
    it(`${kind}: accountant drafts, manager reviews and approves`, async () => {
      const accountant = inventoryRouter.createCaller(context("accountant", 2))[
        kind
      ];
      const manager = inventoryRouter.createCaller(
        context("accounting_manager", 3)
      )[kind];
      const input = {
        ...(kind === "assets" ? { assetName: "أصل" } : { name: "عهدة" }),
        quantity: 1,
        assetValue: "500.00",
        assignedTo: 1,
        locationId: 1,
        departmentId: 1,
      };
      const { id } = await accountant.create(input);
      await expect(
        accountant.approve({ id, expectedVersion: 0 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        accountant.requestChanges({
          id,
          expectedVersion: 0,
          note: "تجاوز الاعتماد",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await manager.requestChanges({
        id,
        expectedVersion: 0,
        note: "راجع الاسم",
      });
      await accountant.update({ ...input, id, expectedVersion: 1 });
      await manager.approve({ id, expectedVersion: 2 });
      expect(
        state.db.rows()[kind === "assets" ? "assets" : "custody_items"][0]
      ).toMatchObject({ status: "ACTIVE", approvedBy: 3 });
    });
  it("accountant prepares and submits warranty; manager executes it", async () => {
    state.db
      .rows()
      .assets.push({
        id: 1,
        assetName: "الأصل السابق",
        assetCode: "A1",
        status: "ACTIVE",
        quantity: 1,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        assetValue: "500.00",
        assignedTo: 1,
        locationId: 1,
        departmentId: 1,
      });
    const accountant = warrantyRouter.createCaller(context("accountant", 2)),
      manager = warrantyRouter.createCaller(context("accounting_manager", 3));
    const request = {
      entityType: "asset" as const,
      entityId: 1,
      quantity: 1,
      provider: "الوكيل",
      claimReference: "REF-1",
      reason: "عطل مصنعي",
      incidentDate: "2026-10-01",
      effectiveDate: "2026-10-05",
      originalWarrantyStart: "2026-01-01",
      originalWarrantyEnd: "2027-01-01",
      replacementWarrantyStart: "2026-01-01",
      replacementWarrantyEnd: "2027-01-01",
      warrantyPolicy: "continued" as const,
      originalSerialNumbers: ["OLD"],
      replacementSerialNumbers: ["NEW"],
      replacementName: "بديل",
      documents: [{ name: "ضمان.pdf", url: "/api/files/warranty/proof.pdf" }],
      notes: "",
    };
    const saved = await accountant.saveDraft({ request });
    await expect(
      manager.execute({ id: saved.id, expectedVersion: 0 })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await accountant.submit({ id: saved.id, expectedVersion: 0 });
    const reviewed = { id: saved.id, expectedVersion: 1 };
    await expect(accountant.execute(reviewed)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      accountant.returnForCorrection({ ...reviewed, note: "تجاوز" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await manager.returnForCorrection({ ...reviewed, note: "راجع المستند" });
    await accountant.saveDraft({ request, id: saved.id, expectedVersion: 2 });
    await accountant.submit({ id: saved.id, expectedVersion: 3 });
    await manager.execute({ id: saved.id, expectedVersion: 4 });
    expect(state.db.rows().warranty_replacements[0]).toMatchObject({
      createdBy: 2,
      executedBy: 3,
      status: "EXECUTED",
    });
    expect(state.db.rows().assets[0].status).toBe("REPLACED");
    expect(state.db.rows().assets[1].approvedBy).toBe(3);
  });
  it.each(["accounting_manager", "accountant", "employee"])(
    "%s cannot access user administration or promote their own role",
    async role => {
      const auth = localAuthRouter.createCaller(context(role));
      await expect(auth.listUsers()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        auth.createUser({
          username: "newuser",
          name: "مستخدم",
          password: "QA-Test-2026!",
          role: "admin",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        auth.updateUser({ id: 1, role: "owner" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        backupRouter.createCaller(context(role)).list()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(state.db.rows().users).toHaveLength(0);
    }
  );
  it.each(["owner", "admin"])(
    "%s can create and assign the accounting manager role",
    async role => {
      const auth = localAuthRouter.createCaller(context(role));
      await auth.createUser({
        username: "finance",
        name: "مدير الحسابات",
        password: "test-password",
        role: "accounting_manager",
      });
      expect(state.db.rows().users[0].role).toBe("accounting_manager");
      await auth.updateUser({ id: 1, role: "accountant" });
      expect(state.db.rows().users[0].role).toBe("accountant");
      await auth.updateUser({ id: 1, role: "accounting_manager" });
      expect(state.db.rows().users[0].role).toBe("accounting_manager");
    }
  );
});
