import { beforeEach, describe, it, expect, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { transactionDatabase } from "./test-utils/transactionDatabase";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("./db", () => ({ getDb: async () => state.db }));
import { depreciationRouter } from "./depreciationRouter";
import { protectFinancialHistory } from "./financialOperationalGuard";
import { batchPayload } from "../shared/depreciation";
import * as XLSX from "xlsx";

const ctx = (role = "accountant", id = 1) =>
  ({
    user: { id, name: `U${id}`, role },
    req: { ip: "127.0.0.1", headers: {} },
    res: {},
  }) as TrpcContext;
const caller = (role = "accountant", id = 1) =>
  depreciationRouter.createCaller(ctx(role, id));
const allocation = {
  costCenter: "CC",
  location: "L",
  branch: "B",
  department: "D",
};
const setup = {
  organizationName: "المؤسسة",
  currency: "SAR",
  fiscalStartMonth: 1,
  openingDate: "2026-05-01",
  capitalizationThreshold: "0",
  partialMonth: "ACTUAL_DAYS" as const,
  rules: [
    {
      classificationId: 1,
      treatment: "DEPRECIABLE" as const,
      lifeMonths: 60,
      residualPercent: "0",
      expenseName: "مصروف إهلاك الأثاث",
      accumulatedName: "مجمع إهلاك الأثاث",
      costName: "الأثاث",
    },
  ],
};
const profile = {
  label: "دفعة أثاث",
  quantity: 2,
  unitCost: "6000",
  unitResidual: "0",
  openingAccumulated: "0",
  openingImpairment: "0",
  recognitionDate: "2026-05-01",
  availableForUseDate: "2026-05-01",
  balanceDate: "2026-05-01",
  lifeMonths: 60,
  documentReference: "INV-1",
  allocation,
  units: ["U1", "U2"],
  notes: "",
};
beforeEach(() => {
  state.db = transactionDatabase({
    depreciation_control: [{ id: 1, revision: 0 }],
    financial_classifications: [
      { id: 1, code: "F", name: "الأثاث", active: true },
    ],
    depreciation_policies: [],
    depreciation_batches: [],
    depreciation_movements: [],
    depreciation_periods: [],
    depreciation_journals: [],
    depreciation_exports: [],
    assets: [
      {
        id: 1,
        assetName: "أثاث",
        assetCode: "A1",
        quantity: 2,
        classificationId: 1,
        status: "ACTIVE",
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
        approvedAt: new Date("2026-05-01"),
      },
    ],
    custody_items: [],
    asset_exclusions: [],
    asset_transfers: [],
    warranty_replacements: [],
    audit_log: [],
    archive_documents: [],
  });
});
async function approveDoc(kind: "policy" | "batch" | "movement", id: number) {
  await caller().submitDocument({ kind, id, expectedVersion: 0 });
  return caller("accounting_manager", 2).approveDocument({
    kind,
    id,
    expectedVersion: 1,
  });
}
async function ready() {
  const policy = await caller().savePolicy({
    effectiveDate: "2026-05-01",
    payload: setup,
  });
  await approveDoc("policy", policy.id!);
  const b = await caller().saveBatch({
    entityType: "asset",
    entityId: 1,
    classificationId: 1,
    policyId: policy.id!,
    payload: profile,
  });
  await approveDoc("batch", b.id!);
  return b.id!;
}
async function period(month = "2026-05") {
  const r = await caller().savePeriod({ month });
  await caller().submitPeriod({ id: r.id, expectedVersion: 0 });
  return {
    id: r.id,
    ...(await caller("accounting_manager", 2).approvePeriod({
      id: r.id,
      expectedVersion: 1,
    })),
  };
}
describe("estimate and warranty financial integrity", () => {
  const estimate = {
    units: ["U1"],
    reason: "تقدير جديد",
    documentReference: "EST",
    unitResidual: "5500",
    remainingLifeMonths: 60,
  };
  const correction = (unitCost: string) => ({
    ...estimate,
    unitResidual: "0",
    unitCost,
    unitAccumulated: "0",
    unitImpairment: "0",
    correctionAccount: "تصحيح",
  });
  async function movement(
    batchId: number,
    kind: "ESTIMATE" | "CORRECTION",
    effectiveDate: string,
    payload: any
  ) {
    return caller().saveMovement({
      batchId,
      kind,
      effectiveDate,
      sourceKey: null,
      payload,
    });
  }
  async function warranty(batchId: number, effectiveDate: string) {
    state.db.rows().assets.push({
      id: 2,
      assetName: "بديل",
      assetCode: "A2",
      status: "ACTIVE",
      quantity: 1,
      classificationId: 1,
    });
    state.db.rows().warranty_replacements.push({
      id: 1,
      status: "EXECUTED",
      entityType: "asset",
      entityId: 1,
      replacementEntityId: 2,
      payload: { effectiveDate, quantity: 1, reason: "ضمان" },
    });
    return caller().saveMovement({
      batchId,
      kind: "WARRANTY",
      effectiveDate,
      sourceKey: "warranty:1",
      payload: {
        units: ["U1"],
        reason: "ضمان",
        documentReference: "W",
        replacement: {
          entityId: 2,
          availableForUseDate: effectiveDate,
          remainingLifeMonths: 60,
          units: ["NEW1"],
          allocation,
        },
      },
    });
  }
  it.each([
    "unitCost",
    "unitAccumulated",
    "unitImpairment",
    "correctionAccount",
  ])("rejects correction-only %s at estimate draft entry", async field => {
    const batchId = await ready();
    await expect(
      movement(batchId, "ESTIMATE", "2026-06-01", {
        ...estimate,
        [field]: field === "correctionAccount" ? "حساب" : "100000",
      })
    ).rejects.toThrow("تغيير التقدير لا يغير التكلفة");
    expect(state.db.rows().depreciation_movements).toHaveLength(0);
  });
  it.each(["preview", "submit", "approve"])(
    "revalidates a legacy forged estimate at %s",
    async action => {
      const batchId = await ready();
      const m = await movement(batchId, "ESTIMATE", "2026-06-01", estimate);
      const row = state.db.rows().depreciation_movements[0];
      row.payload = {
        ...row.payload,
        unitCost: "100000",
        unitResidual: "6500",
      };
      if (action === "approve") {
        row.status = "SUBMITTED";
        row.version = 1;
      }
      const input = {
        kind: "movement" as const,
        id: m.id!,
        expectedVersion: action === "approve" ? 1 : 0,
      };
      const run =
        action === "preview"
          ? caller().previewDocument(input)
          : action === "submit"
            ? caller().submitDocument(input)
            : caller("accounting_manager", 2).approveDocument(input);
      await expect(run).rejects.toThrow("تغيير التقدير لا يغير التكلفة");
      expect(state.db.rows().depreciation_movements[0].status).toBe(
        action === "approve" ? "SUBMITTED" : "DRAFT"
      );
      expect(state.db.rows().depreciation_journals).toHaveLength(0);
    }
  );
  it("uses corrected cost separately for each selected unit", async () => {
    const batchId = await ready();
    const c = await movement(
      batchId,
      "CORRECTION",
      "2026-05-01",
      correction("7200")
    );
    await approveDoc("movement", c.id!);
    const valid = await movement(batchId, "ESTIMATE", "2026-06-01", {
      ...estimate,
      unitResidual: "6500",
    });
    await approveDoc("movement", valid.id!);
    const mixed = await movement(batchId, "ESTIMATE", "2026-07-01", {
      ...estimate,
      unitResidual: "6500",
      units: ["U1", "U2"],
    });
    await expect(
      caller().submitDocument({
        kind: "movement",
        id: mixed.id!,
        expectedVersion: 0,
      })
    ).rejects.toThrow("التكلفة الفعلية");
  });
  it("rejects residual above a reduced effective cost despite a larger opening cost", async () => {
    const batchId = await ready();
    const c = await movement(
      batchId,
      "CORRECTION",
      "2026-05-01",
      correction("5000")
    );
    await approveDoc("movement", c.id!);
    const m = await movement(batchId, "ESTIMATE", "2026-06-01", estimate);
    await expect(
      caller().submitDocument({
        kind: "movement",
        id: m.id!,
        expectedVersion: 0,
      })
    ).rejects.toThrow("التكلفة الفعلية");
  });
  it("rejects a backdated correction that invalidates an approved future estimate", async () => {
    const batchId = await ready();
    const e = await movement(batchId, "ESTIMATE", "2026-07-01", estimate);
    await approveDoc("movement", e.id!);
    const c = await movement(
      batchId,
      "CORRECTION",
      "2026-06-01",
      correction("5000")
    );
    await expect(
      caller().submitDocument({
        kind: "movement",
        id: c.id!,
        expectedVersion: 0,
      })
    ).rejects.toThrow("التكلفة الفعلية");
    expect(state.db.rows().depreciation_journals).toHaveLength(0);
  });
  it("preserves posted correction balances by rejecting an earlier correction", async () => {
    const batchId = await ready();
    const later = await movement(
      batchId,
      "CORRECTION",
      "2026-07-01",
      correction("7000")
    );
    await approveDoc("movement", later.id!);
    const e = await movement(batchId, "ESTIMATE", "2026-08-01", {
      ...estimate,
      unitResidual: "6500",
    });
    await approveDoc("movement", e.id!);
    const earlier = await movement(
      batchId,
      "CORRECTION",
      "2026-06-01",
      correction("5000")
    );
    await expect(
      caller().submitDocument({
        kind: "movement",
        id: earlier.id!,
        expectedVersion: 0,
      })
    ).rejects.toThrow("تسبق حركة محاسبية معتمدة");
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-08-31",
    });
    expect(report.total).toMatchObject({
      costAdjustments: "1000.00",
      closingCost: "13000.00",
    });
  });
  it("preserves a legitimate residual above net book value through warranty and reporting", async () => {
    const batchId = await ready();
    await period();
    await period("2026-06");
    const e = await movement(batchId, "ESTIMATE", "2026-07-01", {
      ...estimate,
      unitResidual: "5900",
    });
    await approveDoc("movement", e.id!);
    const w = await warranty(batchId, "2026-07-02");
    await approveDoc("movement", w.id!);
    const replacement = state.db
      .rows()
      .depreciation_batches.find((r: any) => r.entityId === 2);
    expect(replacement.payload).toMatchObject({
      unitCost: "6000.00",
      openingAccumulated: "200.00",
      openingImpairment: "0.00",
      unitResidual: "5900.00",
    });
    expect(batchPayload.safeParse(replacement.payload).success).toBe(true);
    await period("2026-07");
    const report = await caller().report({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(report.total).toMatchObject({
      closingCost: "12000.00",
      closingAccum: "500.00",
      charge: "100.00",
      net: "11500.00",
    });
  });
  it.each(["WARRANTY", "DISPOSAL"] as const)(
    "protects later %s journals and snapshots from backdated estimates and corrections",
    async kind => {
      const batchId = await ready();
      let m;
      if (kind === "WARRANTY") m = await warranty(batchId, "2026-07-02");
      else {
        state.db.rows().asset_exclusions.push({
          id: 1,
          entityType: "asset",
          entityId: 1,
          effectiveDate: "2026-07-02",
          quantityExcluded: 1,
          reason: "تلف",
        });
        m = await caller().saveMovement({
          batchId,
          kind,
          effectiveDate: "2026-07-02",
          sourceKey: "exclusion:1",
          payload: { units: ["U1"], reason: "تلف", documentReference: "EX" },
        });
      }
      await approveDoc("movement", m.id!);
      const before = JSON.stringify({
        journals: state.db.rows().depreciation_journals,
        batches: state.db.rows().depreciation_batches,
      });
      for (const movementKind of ["ESTIMATE", "CORRECTION"] as const) {
        const earlier = await movement(
          batchId,
          movementKind,
          "2026-06-01",
          movementKind === "ESTIMATE"
            ? { ...estimate, unitResidual: "0" }
            : correction("5000")
        );
        await expect(
          caller().submitDocument({
            kind: "movement",
            id: earlier.id!,
            expectedVersion: 0,
          })
        ).rejects.toThrow("تسبق حركة محاسبية معتمدة");
        // Existing submitted documents must also be revalidated at approval.
        const row = state.db
          .rows()
          .depreciation_movements.find((r: any) => r.id === earlier.id!);
        row.status = "SUBMITTED";
        row.version = 1;
        await expect(
          caller("accounting_manager", 2).approveDocument({
            kind: "movement",
            id: earlier.id!,
            expectedVersion: 1,
          })
        ).rejects.toThrow("تسبق حركة محاسبية معتمدة");
      }
      expect(
        JSON.stringify({
          journals: state.db.rows().depreciation_journals,
          batches: state.db.rows().depreciation_batches,
        })
      ).toBe(before);
    }
  );
  it("does not block a correction for units unrelated to a later approved journal", async () => {
    const batchId = await ready();
    const later = await movement(
      batchId,
      "CORRECTION",
      "2026-07-01",
      correction("7000")
    );
    await approveDoc("movement", later.id!);
    const earlier = await movement(batchId, "CORRECTION", "2026-06-01", {
      ...correction("5000"),
      units: ["U2"],
    });
    await approveDoc("movement", earlier.id!);
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-07-31",
    });
    expect(report.total).toMatchObject({
      costAdjustments: "0.00",
      closingCost: "12000.00",
    });
  });
  it("rolls back warranty approval when a legacy approved estimate would poison the replacement", async () => {
    const batchId = await ready();
    const e = await movement(batchId, "ESTIMATE", "2026-05-01", {
      ...estimate,
      unitResidual: "0",
    });
    await approveDoc("movement", e.id!);
    state.db.rows().depreciation_movements[0].payload = {
      ...state.db.rows().depreciation_movements[0].payload,
      unitCost: "100000",
      unitResidual: "6500",
    };
    const w = await warranty(batchId, "2026-05-02");
    await caller().submitDocument({
      kind: "movement",
      id: w.id!,
      expectedVersion: 0,
    });
    const auditCount = state.db.rows().audit_log.length;
    await expect(
      caller("accounting_manager", 2).approveDocument({
        kind: "movement",
        id: w.id!,
        expectedVersion: 1,
      })
    ).rejects.toThrow("أرصدة بديل الضمان غير صحيحة");
    expect(state.db.rows().depreciation_batches).toHaveLength(1);
    expect(
      state.db.rows().depreciation_movements.find((r: any) => r.id === w.id!)
        .status
    ).toBe("SUBMITTED");
    expect(state.db.rows().depreciation_journals).toHaveLength(0);
    expect(state.db.rows().audit_log).toHaveLength(auditCount);
    await expect(
      caller().report({ from: "2026-05-01", to: "2026-05-31" })
    ).resolves.toBeDefined();
  });
  it("keeps manual opening limits and rejects forged warranty provenance at submission", async () => {
    expect(
      batchPayload.safeParse({
        ...profile,
        openingAccumulated: "400",
        unitResidual: "5900",
      }).success
    ).toBe(false);
    expect(
      batchPayload.safeParse({
        ...profile,
        openingAccumulated: "400",
        unitResidual: "5900",
        sourceMovementId: 1,
      }).success
    ).toBe(true);
    expect(
      batchPayload.safeParse({
        ...profile,
        openingAccumulated: "12001",
        sourceMovementId: 1,
      }).success
    ).toBe(false);
    expect(
      batchPayload.safeParse({
        ...profile,
        unitResidual: "6001",
        sourceMovementId: 1,
      }).success
    ).toBe(false);
    await ready();
    const b = await caller().saveBatch({
      entityType: "asset",
      entityId: 1,
      classificationId: 1,
      policyId: 1,
      payload: {
        ...profile,
        openingAccumulated: "400",
        unitResidual: "5900",
        sourceMovementId: 1,
      },
    });
    await expect(
      caller().submitDocument({ kind: "batch", id: b.id!, expectedVersion: 0 })
    ).rejects.toThrow("دفعة الضمان تنشأ من اعتماد معالجة الضمان فقط");
  });
});
describe("financial approval and journal workflow", () => {
  it("certifies remaining opening units without inventing pre-opening disposal journals", async () => {
    state.db.rows().asset_exclusions.push({
      id: 9,
      entityType: "asset",
      entityId: 1,
      effectiveDate: "2026-04-01",
      quantityExcluded: 1,
      reason: "قديم",
    });
    const policy = await caller().savePolicy({
      effectiveDate: "2026-05-01",
      payload: setup,
    });
    await approveDoc("policy", policy.id!);
    const b = await caller().saveBatch({
      entityType: "asset",
      entityId: 1,
      classificationId: 1,
      policyId: policy.id!,
      payload: {
        ...profile,
        quantity: 1,
        units: ["U2"],
        recognitionDate: "2025-01-01",
        availableForUseDate: "2025-01-01",
        openingAccumulated: "1000",
        lifeMonths: 50,
      },
    });
    await approveDoc("batch", b.id!);
    expect(
      (await caller().previewPeriod({ month: "2026-05" })).snapshot.exceptions
    ).toEqual([]);
    await period();
    expect(
      (await caller().report({ from: "2026-05-01", to: "2026-05-31" })).total
    ).toMatchObject({
      openingCost: "6000.00",
      openingAccum: "1000.00",
      charge: "100.00",
      removedCost: "0.00",
    });
  });
  it("does not use operational entry approval as financial recognition", async () => {
    await ready();
    state.db.rows().assets[0].approvedAt = new Date("2026-06-01");
    state.db.rows().assets[0].classificationId = null;
    expect(
      (await caller().previewPeriod({ month: "2026-05" })).snapshot.exceptions
    ).toHaveLength(1);
  });
  it("shows an old asset opening balance as opening, not a current-period addition", async () => {
    const policy = await caller().savePolicy({
      effectiveDate: "2026-05-01",
      payload: setup,
    });
    await approveDoc("policy", policy.id!);
    const b = await caller().saveBatch({
      entityType: "asset",
      entityId: 1,
      classificationId: 1,
      policyId: policy.id!,
      payload: {
        ...profile,
        recognitionDate: "2025-01-01",
        availableForUseDate: "2025-01-01",
        openingAccumulated: "2000",
        lifeMonths: 50,
      },
    });
    await approveDoc("batch", b.id!);
    await period();
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(report.total).toMatchObject({
      openingCost: "12000.00",
      additions: "0.00",
      openingAccum: "2000.00",
      charge: "200.00",
      closingAccum: "2200.00",
    });
  });
  it("keeps a correction independent, balances its journal, and reconciles adjusted cost and accumulated balances", async () => {
    const batchId = await ready();
    await period();
    const m = await caller().saveMovement({
      batchId,
      kind: "CORRECTION",
      effectiveDate: "2026-06-01",
      sourceKey: null,
      payload: {
        units: ["U1"],
        reason: "تكلفة غير صحيحة بمستند",
        documentReference: "COR1",
        proceeds: "0",
        unitCost: "7200",
        unitAccumulated: "100",
        unitImpairment: "0",
        unitResidual: "0",
        remainingLifeMonths: 60,
        correctionAccount: "تسويات تصحيح الأصول",
      },
    });
    await approveDoc("movement", m.id!);
    expect(state.db.rows().depreciation_batches[0].payload.unitCost).toBe(
      "6000"
    );
    await period("2026-06");
    const report = await caller().report({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(report.total).toMatchObject({
      openingCost: "12000.00",
      costAdjustments: "1200.00",
      closingCost: "13200.00",
      charge: "218.33",
      closingAccum: "418.33",
      net: "12781.67",
    });
    expect(report.reconciled).toBe(true);
  });
  it("creates archive evidence linked to the asset", async () => {
    await ready();
    await period();
    expect(
      state.db
        .rows()
        .archive_documents.some(
          (a: any) => a.assetId === 1 && a.operationType === "اعتماد إهلاك"
        )
    ).toBe(true);
  });
  it("a separate submitted estimate changes only future depreciation", async () => {
    const batchId = await ready();
    await period();
    const m = await caller().saveMovement({
      batchId,
      kind: "ESTIMATE",
      effectiveDate: "2026-06-01",
      sourceKey: null,
      payload: {
        units: ["U1"],
        reason: "مراجعة عمر",
        documentReference: "REV1",
        proceeds: "0",
        unitResidual: "500",
        remainingLifeMonths: 24,
      },
    });
    await approveDoc("movement", m.id!);
    await period("2026-06");
    const may = await caller().report({ from: "2026-05-01", to: "2026-05-31" });
    expect(may.total.charge).toBe("200.00");
    const june = await caller().report({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(june.total.charge).toBe("325.00");
  });
  it("requires different maker and approver and rejects accountant/employee approval", async () => {
    const r = await caller().savePolicy({
      effectiveDate: "2026-05-01",
      payload: setup,
    });
    await caller().submitDocument({
      kind: "policy",
      id: r.id!,
      expectedVersion: 0,
    });
    await expect(
      caller("accounting_manager", 1).approveDocument({
        kind: "policy",
        id: r.id!,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().approveDocument({
        kind: "policy",
        id: r.id!,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller("employee").workspace()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("rejects stale saves and never edits an approved profile", async () => {
    const id = await ready();
    await expect(
      caller().saveBatch({
        id,
        expectedVersion: 2,
        entityType: "asset",
        entityId: 1,
        classificationId: 1,
        policyId: 1,
        payload: profile,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const p = await caller().savePolicy({
      effectiveDate: "2026-06-01",
      payload: setup,
    });
    await caller().savePolicy({
      id: p.id,
      expectedVersion: 0,
      effectiveDate: "2026-06-01",
      payload: setup,
    });
    await expect(
      caller().savePolicy({
        id: p.id,
        expectedVersion: 0,
        effectiveDate: "2026-06-01",
        payload: setup,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("creates exactly one balanced monthly journal and reconciles roll forward", async () => {
    await ready();
    const r = await period();
    expect(state.db.rows().depreciation_journals).toHaveLength(1);
    expect(
      state.db
        .rows()
        .depreciation_journals[0].snapshot.lines.map((l: any) => [
          l.debit,
          l.credit,
        ])
    ).toEqual([
      ["200.00", "0.00"],
      ["0.00", "200.00"],
    ]);
    await expect(
      caller("accounting_manager", 2).approvePeriod({
        id: r.id,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(report.total).toMatchObject({
      openingCost: "0.00",
      additions: "12000.00",
      charge: "200.00",
      closingAccum: "200.00",
      net: "11800.00",
    });
    expect(report.reconciled).toBe(true);
  });
  it("rolls back period approval when audit fails", async () => {
    await ready();
    const r = await caller().savePeriod({ month: "2026-05" });
    await caller().submitPeriod({ id: r.id, expectedVersion: 0 });
    state.db.failOn("audit_log", state.db.rows().audit_log.length + 1);
    await expect(
      caller("accounting_manager", 2).approvePeriod({
        id: r.id,
        expectedVersion: 1,
      })
    ).rejects.toThrow();
    expect(state.db.rows().depreciation_journals).toEqual([]);
    expect(state.db.rows().depreciation_periods[0].status).toBe("SUBMITTED");
  });
  it("blocks incomplete profiles and unreviewed exclusions", async () => {
    await ready();
    state.db.rows().asset_exclusions.push({
      id: 1,
      entityType: "asset",
      entityId: 1,
      effectiveDate: "2026-05-16",
      quantityExcluded: 1,
      reason: "تلف",
    });
    const preview = await caller().previewPeriod({ month: "2026-05" });
    expect(preview.snapshot.exceptions).toHaveLength(1);
    const r = await caller().savePeriod({ month: "2026-05" });
    await expect(
      caller().submitPeriod({ id: r.id, expectedVersion: 0 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("detects operational sources changed after draft or submission", async () => {
    await ready();
    const r = await caller().savePeriod({ month: "2026-05" });
    await caller().submitPeriod({ id: r.id, expectedVersion: 0 });
    state.db.rows().asset_transfers.push({
      id: 1,
      entityType: "asset",
      entityId: 1,
      quantity: 2,
      transferredAt: new Date("2026-06-01"),
    });
    await expect(
      caller("accounting_manager", 2).approvePeriod({
        id: r.id,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("requires chronological approval", async () => {
    await ready();
    const r = await caller().savePeriod({ month: "2026-06" });
    await caller().submitPeriod({ id: r.id, expectedVersion: 0 });
    await expect(
      caller("accounting_manager", 2).approvePeriod({
        id: r.id,
        expectedVersion: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("reviews partial disposal, generates balanced gain/loss and correct quantity expense", async () => {
    const batchId = await ready();
    state.db.rows().asset_exclusions.push({
      id: 1,
      entityType: "asset",
      entityId: 1,
      effectiveDate: "2026-05-16",
      quantityExcluded: 1,
      reason: "تلف",
    });
    const m = await caller().saveMovement({
      batchId,
      kind: "DISPOSAL",
      effectiveDate: "2026-05-16",
      sourceKey: "exclusion:1",
      payload: {
        units: ["U1"],
        reason: "تلف",
        documentReference: "EX1",
        proceeds: "500",
      },
    });
    await approveDoc("movement", m.id!);
    await period();
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(report.total).toMatchObject({
      charge: "148.39",
      removedCost: "6000.00",
      removedAccum: "48.39",
      closingCost: "6000.00",
      closingAccum: "100.00",
      net: "5900.00",
    });
    expect(report.journals).toHaveLength(2);
  });
  it("preserves gross cost and accumulated depreciation when replacing under warranty", async () => {
    const batchId = await ready();
    state.db.rows().assets.push({
      id: 2,
      assetName: "بديل",
      assetCode: "A2",
      status: "ACTIVE",
      quantity: 1,
      classificationId: 1,
    });
    state.db.rows().warranty_replacements.push({
      id: 1,
      status: "EXECUTED",
      entityType: "asset",
      entityId: 1,
      replacementEntityId: 2,
      payload: { effectiveDate: "2026-05-16", quantity: 1, reason: "ضمان" },
    });
    const m = await caller().saveMovement({
      batchId,
      kind: "WARRANTY",
      effectiveDate: "2026-05-16",
      sourceKey: "warranty:1",
      payload: {
        units: ["U1"],
        reason: "ضمان",
        documentReference: "W1",
        proceeds: "0",
        replacement: {
          entityId: 2,
          availableForUseDate: "2026-05-16",
          remainingLifeMonths: 60,
          units: ["NEW1"],
          allocation,
        },
      },
    });
    await approveDoc("movement", m.id!);
    const replacement = state.db
      .rows()
      .depreciation_batches.find((b: any) => b.entityId === 2);
    expect(replacement.payload).toMatchObject({
      unitCost: "6000.00",
      openingAccumulated: "48.39",
      units: ["NEW1"],
    });
    const preview = await caller().previewPeriod({ month: "2026-05" });
    expect(preview.snapshot.exceptions).toEqual([]);
  });
  it("exports only approved complete months with numeric money cells and exact period title", async () => {
    await ready();
    await period();
    const result = await caller().exportJournals({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    const wb = XLSX.read(result.base64, { type: "base64" });
    expect(wb.SheetNames).toEqual(["القيود", "التفاصيل"]);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["القيود"], {
      header: 1,
    }) as any[][];
    expect(rows[0][0]).toContain("من 01/05/2026 إلى 31/05/2026");
    expect(rows[3][7]).toBe(200);
    expect(state.db.rows().depreciation_exports).toHaveLength(1);
  });
  it("reverse is immutable evidence and closed periods reject reversal", async () => {
    await ready();
    const r = await period();
    await caller("accounting_manager", 2).reversePeriod({
      id: r.id,
      expectedVersion: 2,
      reason: "تصحيح",
    });
    expect(state.db.rows().depreciation_journals).toHaveLength(2);
    expect(
      state.db.rows().depreciation_journals[1].snapshot.lines[0]
    ).toMatchObject({ debit: "0.00", credit: "200.00" });
    const report = await caller().report({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(report.total.charge).toBe("0.00");
    await caller().savePeriod({ month: "2026-05", expectedVersion: 3 });
    await caller().submitPeriod({ id: r.id, expectedVersion: 4 });
    await caller("accounting_manager", 2).approvePeriod({
      id: r.id,
      expectedVersion: 5,
    });
    await caller("accounting_manager", 2).closePeriod({
      id: r.id,
      expectedVersion: 6,
    });
    await expect(
      caller("accounting_manager", 2).reversePeriod({
        id: r.id,
        expectedVersion: 7,
        reason: "خطأ",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("mid-month reports use posted movements without invented approved daily charges", async () => {
    await ready();
    await period();
    const r = await caller().report({ from: "2026-05-01", to: "2026-05-15" });
    expect(r.total.charge).toBe("0.00");
    expect(r.basis).toContain("لا يشمل احتساباً تقديرياً");
  });
  it("protects operational movements inside approved accounting history", async () => {
    await ready();
    await period();
    await expect(
      protectFinancialHistory(state.db, "asset", 1, "2026-05-20")
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      protectFinancialHistory(state.db, "asset", 1, "2026-06-01")
    ).resolves.toBeUndefined();
  });
});
