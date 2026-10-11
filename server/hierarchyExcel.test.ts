import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { transactionDatabase } from "./test-utils/transactionDatabase";
import type { TrpcContext } from "./_core/context";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
vi.mock("./security", () => ({ logAuditAction: vi.fn() }));
import { excelRouter } from "./routers/excel";
import { settingsRouter } from "./routers/settings";
const context = (role = "accountant") =>
  ({
    user: { id: 1, name: "المستخدم", role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  }) as TrpcContext;
const caller = (role?: string) => excelRouter.createCaller(context(role));
const file = (rows: unknown[][]) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "بيانات");
  return XLSX.write(book, { type: "base64", bookType: "xlsx" }) as string;
};
const read = (base64: string) => {
  const book = XLSX.read(base64, { type: "base64" });
  return XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], {
    header: 1,
    raw: false,
  });
};
beforeEach(() => {
  state.db = transactionDatabase({
    app_settings: [{ id: 1, locationSequence: 1 }],
    locations: [
      {
        id: 1,
        code: "01",
        name: "الرياض",
        assetPrefix: "AST",
        custodyPrefix: "CUS",
        branchSequence: 1,
      },
    ],
    branches: [
      {
        id: 1,
        code: "01-01",
        name: "الرئيسي",
        locationId: 1,
        departmentSequence: 1,
      },
    ],
    departments: [
      { id: 1, code: "01-01-001", name: "المالية", branchId: 1, locationId: 1 },
    ],
    audit_log: [],
  });
});
describe("Hierarchy Excel", () => {
  for (const [type, rows, code] of [
    [
      "locations",
      [
        ["اسم الموقع", "بادئة الأصول", "بادئة العهد"],
        ["جدة", "JD-A", "JD-C"],
      ],
      "02",
    ],
    [
      "branches",
      [
        ["اسم الفرع", "كود الموقع"],
        ["جديد", "01"],
      ],
      "01-02",
    ],
    [
      "departments",
      [
        ["اسم القسم", "كود الفرع"],
        ["جديد", "01-01"],
      ],
      "01-01-002",
    ],
  ] as const) {
    it(`${type}: preview is read-only and execution allocates codes with audit`, async () => {
      const before = structuredClone(state.db.rows());
      const input = { type, base64Data: file(rows.map(row => [...row])) };
      const preview = await caller().importHierarchy(input);
      expect(preview).toMatchObject({
        imported: 1,
        rejected: 0,
        previewOnly: true,
      });
      expect(state.db.rows()).toEqual(before);
      const result = await caller().importHierarchy({
        ...input,
        previewOnly: false,
      });
      expect(result.imported).toBe(1);
      expect(state.db.rows()[type].at(-1).code).toBe(code);
      expect(
        state.db.rows().audit_log.map((row: any) => row.actionType)
      ).toEqual(["CREATE", "IMPORT"]);
      expect(state.db.rows().app_settings).toHaveLength(1);
    });
    it(`${type}: template and export contain appropriate hierarchy columns`, async () => {
      const template = await caller().hierarchyTemplate({ type });
      expect(read(template.base64)[0][0]).toBe(rows[0][0]);
      expect(read(template.base64)[0]).not.toContain("الكود");
      const exported = await caller().exportHierarchy({ type });
      const values = read(exported.base64);
      expect(exported.count).toBe(1);
      expect(values[0][0]).toBe("الكود");
      expect(values[1][0]).toBe(state.db.rows()[type][0].code);
      if (type !== "locations") expect(values[1]).toContain("الرياض");
      if (type === "departments") expect(values[1]).toContain("01-01");
      const reimport = await caller().importHierarchy({
        type,
        base64Data: exported.base64,
        previewOnly: false,
      });
      expect(reimport).toMatchObject({ imported: 0, existing: 1, rejected: 0 });
      expect(state.db.rows()[type]).toHaveLength(1);
    });
  }
  it("ignores existing records and duplicates within a file", async () => {
    const result = await caller().importHierarchy({
      type: "locations",
      previewOnly: false,
      base64Data: file([["اسم الموقع"], [" الرياض "], ["جدة"], ["جدة"]]),
    });
    expect(result).toMatchObject({ imported: 1, existing: 2, rejected: 0 });
    expect(state.db.rows().app_settings[0].locationSequence).toBe(2);
  });
  it("rejects duplicate prefixes within the file and keeps valid rows", async () => {
    const result = await caller().importHierarchy({
      type: "locations",
      previewOnly: false,
      base64Data: file([
        ["اسم الموقع", "بادئة الأصول"],
        ["جدة", "J-A"],
        ["الدمام", "J-A"],
        ["آخر", "AST"],
        ["خطأ", "bad / prefix"],
      ]),
    });
    expect(result).toMatchObject({ imported: 1, rejected: 3 });
    expect(state.db.rows().locations).toHaveLength(2);
  });
  it("rejects a name that conflicts with the supplied parent code", async () => {
    const result = await caller().importHierarchy({
      type: "branches",
      base64Data: file([
        ["اسم الفرع", "كود الموقع", "اسم الموقع"],
        ["جديد", "01", "جدة"],
      ]),
    });
    expect(result.rejected).toBe(1);
    expect(result.results[0].message).toContain("لا يطابق");
  });
  it("resolves parent by unique name and rejects ambiguous names", async () => {
    const input = {
      type: "branches" as const,
      base64Data: file([
        ["اسم الفرع", "اسم الموقع"],
        ["جديد", "الرياض"],
      ]),
    };
    expect((await caller().importHierarchy(input)).imported).toBe(1);
    state.db.rows().locations.push({ id: 2, code: "02", name: "الرياض" });
    expect((await caller().importHierarchy(input)).rejected).toBe(1);
  });
  it("rejects department branch outside the selected location", async () => {
    state.db.rows().locations.push({ id: 2, code: "02", name: "جدة" });
    const result = await caller().importHierarchy({
      type: "departments",
      base64Data: file([
        ["اسم القسم", "كود الفرع", "كود الموقع"],
        ["جديد", "01-01", "02"],
      ]),
    });
    expect(result.rejected).toBe(1);
  });
  it("does not accept editing an exported code or forcing a new code", async () => {
    const result = await caller().importHierarchy({
      type: "locations",
      base64Data: file([
        ["الكود", "اسم الموقع"],
        ["01", "اسم معدل"],
        ["99", "جديد"],
      ]),
    });
    expect(result).toMatchObject({ imported: 0, rejected: 2 });
  });
  it("preserves actual row numbers across empty rows", async () => {
    const result = await caller().importHierarchy({
      type: "branches",
      base64Data: file([["اسم الفرع", "كود الموقع"], [], ["جديد", "99"]]),
    });
    expect(result.results[0].rowNumber).toBe(3);
  });
  it("revalidates parents between preview and execution", async () => {
    const input = {
      type: "branches" as const,
      base64Data: file([
        ["اسم الفرع", "كود الموقع"],
        ["جديد", "01"],
      ]),
    };
    expect((await caller().importHierarchy(input)).imported).toBe(1);
    state.db.rows().locations = [];
    expect(
      (await caller().importHierarchy({ ...input, previewOnly: false }))
        .rejected
    ).toBe(1);
    expect(state.db.rows().branches).toHaveLength(1);
  });
  for (const table of ["audit_log", "locations", "app_settings"])
    it(`rolls back records and counters on ${table} failure`, async () => {
      const before = structuredClone(state.db.rows());
      state.db.failOn(
        table,
        table === "audit_log" || table === "locations" ? 2 : 3
      );
      await expect(
        caller().importHierarchy({
          type: "locations",
          previewOnly: false,
          base64Data: file([["اسم الموقع"], ["جدة"], ["الدمام"]]),
        })
      ).rejects.toThrow("Injected");
      expect(state.db.rows()).toEqual(before);
    });
  for (const type of ["locations", "branches", "departments"] as const)
    it(`${type}: employee cannot import, export or download templates`, async () => {
      await expect(
        caller("employee").hierarchyTemplate({ type })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller("employee").exportHierarchy({ type })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller("employee").importHierarchy({ type, base64Data: "x" })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(
        (await caller("accounting_manager").hierarchyTemplate({ type })).base64
      ).toBeTruthy();
    });
  it("rejects wrong template, duplicate headers, empty file and row overflow", async () => {
    for (const rows of [
      [["اسم القسم"], ["قسم"]],
      [
        ["اسم الموقع", "اسم الموقع"],
        ["أ", "ب"],
      ],
      [["اسم الموقع"]],
      [["اسم الموقع"], ...Array.from({ length: 1001 }, (_, i) => [String(i)])],
    ]) {
      await expect(
        caller().importHierarchy({ type: "locations", base64Data: file(rows) })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });
  it("manual creation and import share hierarchy counters", async () => {
    const settings = settingsRouter.createCaller(context());
    const location = await settings.locations.create({ name: "جدة" });
    expect(location.code).toBe("02");
    const branch = await settings.branches.create({
      name: "جديد",
      locationId: 1,
    });
    expect(branch.code).toBe("01-02");
    const department = await settings.departments.create({
      name: "جديد",
      branchId: 1,
    });
    expect(department.code).toBe("01-01-002");
    const result = await caller().importHierarchy({
      type: "branches",
      previewOnly: false,
      base64Data: file([
        ["اسم الفرع", "كود الموقع"],
        ["التالي", "01"],
      ]),
    });
    expect(result.imported).toBe(1);
    expect(state.db.rows().branches.at(-1).code).toBe("01-03");
  });
});
