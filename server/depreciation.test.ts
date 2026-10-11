import { describe, expect, it } from "vitest";
import {
  amount,
  money,
  batchPayload,
  calculateBatch,
  type FinancialBatch,
  type FinancialMovement,
  periodTitle,
} from "../shared/depreciation";

const batch = (
  changes: Partial<FinancialBatch["payload"]> = {}
): FinancialBatch => ({
  id: 1,
  entityType: "asset",
  entityId: 1,
  classificationId: 1,
  policyId: 1,
  identity: {
    name: "أثاث",
    code: "A1",
    classification: "أثاث",
    classificationCode: "F",
  },
  rule: {
    classificationId: 1,
    treatment: "DEPRECIABLE",
    lifeMonths: 60,
    residualPercent: "0",
    expenseName: "مصروف إهلاك الأثاث",
    accumulatedName: "مجمع إهلاك الأثاث",
    costName: "الأثاث",
  },
  partialMonth: "ACTUAL_DAYS",
  payload: {
    label: "دفعة",
    quantity: 1,
    unitCost: "6000",
    unitResidual: "0",
    openingAccumulated: "0",
    openingImpairment: "0",
    recognitionDate: "2026-01-01",
    availableForUseDate: "2026-01-01",
    balanceDate: "2026-01-01",
    lifeMonths: 60,
    units: ["U1"],
    documentReference: "INV",
    allocation: { costCenter: "CC", location: "L", branch: "", department: "" },
    notes: "",
    ...changes,
  },
});
const total = (lines: ReturnType<typeof calculateBatch>["lines"]) =>
  amount(lines.reduce((n, l) => n + money(l.debit), 0n));
const movement = (
  kind: FinancialMovement["kind"],
  date: string,
  payload: Partial<FinancialMovement["payload"]> = {}
): FinancialMovement => ({
  id: 1,
  batchId: 1,
  kind,
  effectiveDate: date,
  payload: {
    units: ["U1"],
    reason: "سبب",
    documentReference: "D",
    proceeds: "0",
    ...payload,
  },
});
describe("straight-line exact money and dated lifecycle", () => {
  it("splits combined opening balances without making any unit negative",()=>{const b=batch({quantity:2,units:["A","B"],unitCost:"0.01",openingAccumulated:"0.01",openingImpairment:"0.01",recognitionDate:"2025-01-01",availableForUseDate:"2025-01-01"});const r=calculateBatch(b,[],"2026-01-01","2026-01-31");expect(r.units.map(u=>u.net)).toEqual(["0.00","0.00"]);expect(r.units.map(u=>u.impairment)).toEqual(["0.00","0.01"]);});
  it("does not silently round or accept exponent money", () => {
    expect(money("9007199254.99")).toBe(900719925499n);
    expect(() => money("1e3")).toThrow();
    expect(() => money("1.001")).toThrow();
    expect(amount(-1n)).toBe("-0.01");
  });
  it("charges full month and caps useful life", () => {
    expect(
      total(calculateBatch(batch(), [], "2026-05-01", "2026-05-31").lines)
    ).toBe("100.00");
    expect(
      total(calculateBatch(batch(), [], "2026-01-01", "2032-12-31").lines)
    ).toBe("6000.00");
  });
  it("uses ready-for-use, including leap years and actual month length", () => {
    expect(
      total(
        calculateBatch(
          batch({ availableForUseDate: "2026-05-16" }),
          [],
          "2026-05-01",
          "2026-05-31"
        ).lines
      )
    ).toBe("51.61");
    const b = batch({
      recognitionDate: "2024-02-01",
      balanceDate: "2024-02-01",
      availableForUseDate: "2024-02-15",
    });
    expect(total(calculateBatch(b, [], "2024-02-01", "2024-02-29").lines)).toBe(
      "51.72"
    );
  });
  it("opening accumulated and impairment reduce remaining base", () => {
    const result = calculateBatch(
      batch({
        openingAccumulated: "1000",
        openingImpairment: "500",
        unitResidual: "500",
        availableForUseDate: "2025-01-01",
        recognitionDate: "2025-01-01",
        lifeMonths: 40,
      }),
      [],
      "2026-01-01",
      "2026-01-31"
    );
    expect(total(result.lines)).toBe("100.00");
    expect(result.units[0].net).toBe("4400.00");
  });
  it("partial disposal only stops identified units at effective date", () => {
    const b = batch({ quantity: 2, units: ["U1", "U2"] });
    const result = calculateBatch(
      b,
      [movement("DISPOSAL", "2026-05-16")],
      "2026-05-01",
      "2026-05-31"
    );
    expect(total(result.lines)).toBe("148.39");
    expect(result.units.map(u => u.disposed)).toEqual([true, false]);
    expect(
      total(
        calculateBatch(
          b,
          [movement("DISPOSAL", "2026-05-16")],
          "2026-06-01",
          "2026-06-30"
        ).lines
      )
    ).toBe("100.00");
  });
  it("transfer splits expense without changing asset value", () => {
    const m = movement("TRANSFER", "2026-05-16", {
      allocation: {
        costCenter: "NEW",
        location: "NEW",
        branch: "",
        department: "",
      },
    });
    const r = calculateBatch(batch(), [m], "2026-05-01", "2026-05-31");
    expect(total(r.lines)).toBe("100.00");
    expect(r.lines.map(l => l.allocation.costCenter)).toEqual(["CC", "NEW"]);
  });
  it("estimate change uses remaining carrying amount prospectively", () => {
    const m = movement("ESTIMATE", "2026-07-01", {
      remainingLifeMonths: 24,
      unitResidual: "600",
    });
    expect(
      total(calculateBatch(batch(), [m], "2026-06-01", "2026-06-30").lines)
    ).toBe("100.00");
    expect(
      total(calculateBatch(batch(), [m], "2026-07-01", "2026-07-31").lines)
    ).toBe("200.00");
  });
  it("rounding cumulatively reconciles custom adjacent periods", () => {
    const b = batch({ unitCost: "100", lifeMonths: 3 });
    const all = calculateBatch(b, [], "2026-01-01", "2026-03-31");
    const x = calculateBatch(b, [], "2026-01-01", "2026-01-15"),
      y = calculateBatch(b, [], "2026-01-16", "2026-03-31");
    expect(money(total(x.lines)) + money(total(y.lines))).toBe(
      money(total(all.lines))
    );
    expect(total(all.lines)).toBe("100.00");
  });
  it("does not discard unallocated opening cents", () => {
    const b = batch({
      quantity: 3,
      units: ["A", "B", "C"],
      openingAccumulated: "0.01",
      availableForUseDate: "2025-01-01",
      recognitionDate: "2025-01-01",
    });
    const r = calculateBatch(b, [], "2026-01-01", "2032-12-31");
    expect(total(r.lines)).toBe("17999.99");
  });
  it("non depreciable assets keep carrying value", () => {
    const b = batch();
    b.rule.treatment = "NON_DEPRECIABLE";
    const r = calculateBatch(b, [], "2026-01-01", "2035-12-31");
    expect(r.lines).toEqual([]);
    expect(r.units[0].net).toBe("6000.00");
  });
  it("validates identifiers and opening balances", () => {
    expect(
      batchPayload.safeParse(batch({ quantity: 2, units: ["X", "X"] }).payload)
        .success
    ).toBe(false);
    expect(
      batchPayload.safeParse(batch({ openingAccumulated: "6001" }).payload)
        .success
    ).toBe(false);
  });
  it("report title always contains explicit dates", () =>
    expect(periodTitle("الإهلاك", "2026-05-01", "2026-05-31")).toContain(
      "من 01/05/2026 إلى 31/05/2026"
    ));
});
