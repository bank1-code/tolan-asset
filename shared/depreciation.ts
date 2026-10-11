import { z } from "zod";

export const financialDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "أدخل تاريخًا صحيحًا")
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "2200-12-31"
    );
  }, "تاريخ غير صحيح");
export const moneyInput = z
  .string()
  .regex(
    /^\d{1,12}(\.\d{1,2})?$/,
    "أدخل مبلغاً صحيحاً بحد أقصى منزلتين عشريتين"
  );
export const money = (value: string): bigint => {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("مبلغ غير صحيح");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
export const amount = (cents: bigint): string =>
  `${cents < 0n ? "-" : ""}${(cents < 0n ? -cents : cents) / 100n}.${((cents < 0n ? -cents : cents) % 100n).toString().padStart(2, "0")}`;
// Excel supports 15 significant digits; larger totals must retain their exact text.
export const financialExcelCell = (value: string): number | string =>
  /^-?\d+(\.\d{1,2})?$/.test(value) && value.replace(/[-.]/g, "").replace(/^0+/, "").length <= 15
    ? Number(value) : value;
export const classificationRule = z
  .object({
    classificationId: z.number().int().positive(),
    treatment: z.enum(["DEPRECIABLE", "NON_DEPRECIABLE", "EXPENSE"]),
    lifeMonths: z.number().int().min(1).max(1200),
    residualPercent: z
      .string()
      .regex(/^(100|\d{1,2})(\.\d{1,4})?$/, "نسبة القيمة المتبقية يجب أن تكون بين 0 و100 بحد أقصى أربع منازل عشرية")
      .refine(v => Number(v) <= 100, "نسبة القيمة المتبقية يجب ألا تتجاوز 100%"),
    expenseName: z.string().trim().min(1).max(255),
    accumulatedName: z.string().trim().min(1).max(255),
    costName: z.string().trim().min(1).max(255),
  })
  .strict();
export const policyPayload = z
  .object({
    organizationName: z.string().trim().min(1).max(255),
    currency: z.string().regex(/^[A-Z]{3}$/),
    fiscalStartMonth: z.number().int().min(1).max(12),
    openingDate: financialDate.refine(
      v => v.endsWith("-01"),
      "تاريخ بداية الوحدة يجب أن يكون أول شهر"
    ),
    capitalizationThreshold: moneyInput,
    partialMonth: z.enum(["ACTUAL_DAYS", "NEXT_MONTH"]),
    rules: z.array(classificationRule).min(1).max(500),
  })
  .strict()
  .refine(
    p => new Set(p.rules.map(r => r.classificationId)).size === p.rules.length,
    "التصنيف مكرر"
  );

export const allocationSchema = z
  .object({
    costCenter: z.string().trim().min(1).max(200),
    location: z.string().trim().min(1).max(255),
    branch: z.string().max(255).default(""),
    department: z.string().max(255).default(""),
  })
  .strict();
export const batchPayload = z
  .object({
    label: z.string().trim().min(1).max(255),
    quantity: z.number().int().min(1).max(10000),
    unitCost: moneyInput.refine(
      v => moneyInput.safeParse(v).success && money(v) > 0n,
      "التكلفة يجب أن تكون أكبر من صفر"
    ),
    unitResidual: moneyInput,
    openingAccumulated: moneyInput,
    openingImpairment: moneyInput,
    recognitionDate: financialDate,
    availableForUseDate: financialDate,
    balanceDate: financialDate,
    lifeMonths: z.number().int().min(1).max(1200),
    documentReference: z.string().trim().min(1).max(500),
    allocation: allocationSchema,
    units: z.array(z.string().trim().min(1).max(200)).max(10000),
    notes: z.string().max(4000).default(""),
    sourceMovementId: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (p.units.length !== p.quantity || new Set(p.units).size !== p.quantity)
      issue(
        "أدخل معرفاً مميزاً لكل وحدة؛ يمكن استخدام معرف داخلي عند غياب التسلسل"
      );
    if (p.availableForUseDate < p.recognitionDate)
      issue("تاريخ الجاهزية لا يسبق الاعتراف بالأصل");
    if (p.balanceDate < p.recognitionDate)
      issue("تاريخ بدء الرصيد لا يسبق الاعتراف بالأصل");
    // Field validation may already have issues; refinements must not throw.
    if (
      ![
        p.unitCost,
        p.unitResidual,
        p.openingAccumulated,
        p.openingImpairment,
      ].every(value => moneyInput.safeParse(value).success) ||
      !Number.isInteger(p.quantity) ||
      p.quantity < 1 ||
      p.quantity > 10000
    )
      return;
    const total = money(p.unitCost) * BigInt(p.quantity);
    if (money(p.unitResidual) > money(p.unitCost))
      issue("القيمة المتبقية أكبر من التكلفة");
    // Warranty carries historical balances, including a valid estimate whose
    // residual exceeds net book value. Manual opening batches remain stricter;
    // validateBatch rejects caller-supplied sourceMovementId at approval.
    const openingLimit = p.sourceMovementId
      ? total
      : total - money(p.unitResidual) * BigInt(p.quantity);
    if (money(p.openingAccumulated) + money(p.openingImpairment) > openingLimit)
      issue("الأرصدة الافتتاحية تتجاوز الحد المسموح للتكلفة");
  });
export const movementPayload = z
  .object({
    units: z.array(z.string().trim().min(1)).min(1).max(10000),
    reason: z.string().trim().min(1).max(4000),
    documentReference: z.string().trim().min(1).max(500),
    proceeds: moneyInput.default("0"),
    allocation: allocationSchema.optional(),
    remainingLifeMonths: z.number().int().min(1).max(1200).optional(),
    unitResidual: moneyInput.optional(),
    unitCost: moneyInput.optional(),
    unitAccumulated: moneyInput.optional(),
    unitImpairment: moneyInput.optional(),
    correctionAccount: z.string().trim().min(1).max(255).optional(),
    replacement: z
      .object({
        entityId: z.number().int().positive(),
        availableForUseDate: financialDate,
        remainingLifeMonths: z.number().int().min(1).max(1200),
        units: z.array(z.string().trim().min(1)).min(1),
        allocation: allocationSchema,
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(p => new Set(p.units).size === p.units.length, "الوحدات مكررة");

export type PolicyPayload = z.infer<typeof policyPayload>;
export type BatchPayload = z.infer<typeof batchPayload>;
export type MovementPayload = z.infer<typeof movementPayload>;
export type Allocation = z.infer<typeof allocationSchema>;
export type MovementKind =
  "DISPOSAL" | "WARRANTY" | "TRANSFER" | "ESTIMATE" | "CORRECTION";
export const estimateHasCorrectionFields = (p: MovementPayload): boolean =>
  p.unitCost !== undefined ||
  p.unitAccumulated !== undefined ||
  p.unitImpairment !== undefined ||
  p.correctionAccount !== undefined;
export type FinancialBatch = {
  id: number;
  entityType: string;
  entityId: number;
  classificationId: number;
  policyId: number;
  payload: BatchPayload;
  identity: {
    name: string;
    code: string;
    classification: string;
    classificationCode: string;
  };
  rule: z.infer<typeof classificationRule>;
  partialMonth: PolicyPayload["partialMonth"];
};
export type FinancialMovement = {
  id: number;
  batchId: number;
  kind: MovementKind;
  effectiveDate: string;
  payload: MovementPayload;
};

export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
export function nextMonth(date: string): string {
  const parsed = new Date(`${monthStart(date)}T00:00:00Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  return parsed.toISOString().slice(0, 10);
}
export const nextDay = (date: string) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
export const previousDay = (date: string) =>
  new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
export const periodTitle = (name: string, from: string, to: string) =>
  `${name} — الفترة من ${from.split("-").reverse().join("/")} إلى ${to.split("-").reverse().join("/")}`;
export const annualRate = (lifeMonths: number) =>
  (1200 / lifeMonths).toFixed(4);

type Rational = { n: bigint; d: bigint };
const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const add = (a: Rational, b: Rational): Rational => {
  const n = a.n * b.d + b.n * a.d,
    d = a.d * b.d,
    g = gcd(n, d);
  return { n: n / g, d: d / g };
};
const rounded = (r: Rational) => (r.n * 2n + r.d) / (r.d * 2n);
export const splitCents = (total: bigint, count: number, index: number) =>
  total / BigInt(count) + (BigInt(index) < total % BigInt(count) ? 1n : 0n);
export type DepreciationLine = {
  batchId: number;
  entityType: string;
  entityId: number;
  name: string;
  code: string;
  classificationId: number;
  classification: string;
  classificationCode: string;
  unit: string;
  allocation: Allocation;
  from: string;
  to: string;
  debit: string;
  expenseName: string;
  accumulatedName: string;
};
export type UnitBalance = {
  unit: string;
  cost: string;
  accumulated: string;
  impairment: string;
  residual: string;
  net: string;
  disposed: boolean;
  allocation: Allocation;
};

// Compute cumulative cents, then differences. Never round a monthly floating point rate.
// Replaying immutable dated events makes reports independent of today's remaining quantity.
export function calculateBatch(
  batch: FinancialBatch,
  movements: FinancialMovement[],
  from: string,
  to: string
): { lines: DepreciationLine[]; units: UnitBalance[] } {
  financialDate.parse(from);
  financialDate.parse(to);
  if (from > to) throw new Error("بداية الفترة أكبر من نهايتها");
  const p = batch.payload,
    stop = nextDay(to),
    lines: DepreciationLine[] = [],
    balances: UnitBalance[] = [];
  for (let index = 0; index < p.units.length; index++) {
    const unit = p.units[index];
    let cost = money(p.unitCost),
      impairment =
        splitCents(
          money(p.openingAccumulated) + money(p.openingImpairment),
          p.quantity,
          index
        ) - splitCents(money(p.openingAccumulated), p.quantity, index);
    let accumulated = splitCents(
        money(p.openingAccumulated),
        p.quantity,
        index
      ),
      residual = money(p.unitResidual),
      life = p.lifeMonths;
    let base = cost - impairment - residual - accumulated,
      schedule: Rational = { n: 0n, d: 1n },
      priorSchedule = 0n,
      allocation = p.allocation,
      disposed = false;
    const adjusted = (date: string) =>
      batch.partialMonth === "NEXT_MONTH"
        ? date.endsWith("-01")
          ? date
          : nextMonth(date)
        : date;
    let cursor =
      p.balanceDate > adjusted(p.availableForUseDate)
        ? p.balanceDate
        : adjusted(p.availableForUseDate);
    const events = movements
      .filter(m => m.batchId === batch.id && m.payload.units.includes(unit))
      .sort(
        (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id
      );
    for (const event of events)
      if (event.effectiveDate < p.balanceDate)
        throw new Error("حركة تسبق الرصيد المالي الافتتاحي");
    let eventIndex = 0;
    // Process movements at their actual dates even before availability; disposal may precede service.
    let position = p.balanceDate;
    while (position < stop && !disposed) {
      while (
        eventIndex < events.length &&
        events[eventIndex].effectiveDate <= position
      ) {
        const event = events[eventIndex++];
        if (event.kind === "DISPOSAL" || event.kind === "WARRANTY") {
          disposed = true;
          break;
        }
        if (event.kind === "TRANSFER") allocation = event.payload.allocation!;
        if (event.kind === "CORRECTION") {
          cost = money(event.payload.unitCost!);
          accumulated = money(event.payload.unitAccumulated!);
          impairment = money(event.payload.unitImpairment!);
        }
        if (event.kind === "ESTIMATE" || event.kind === "CORRECTION") {
          residual = money(event.payload.unitResidual!);
          life = event.payload.remainingLifeMonths!;
          base = cost - impairment - residual - accumulated;
          if (base < 0n) base = 0n;
          schedule = { n: 0n, d: 1n };
          priorSchedule = 0n;
        }
      }
      if (disposed) break;
      const monthEnd = nextMonth(position),
        eventDate = events[eventIndex]?.effectiveDate;
      const end = [
        monthEnd,
        stop,
        eventDate && eventDate > position ? eventDate : stop,
        from > position ? from : stop,
      ].sort()[0];
      const start = position > cursor ? position : cursor;
      if (start < end && batch.rule.treatment === "DEPRECIABLE" && base > 0n) {
        const days = BigInt(
          Math.round((Date.parse(end) - Date.parse(start)) / 86400000)
        );
        const monthDays = BigInt(
          Math.round(
            (Date.parse(monthEnd) - Date.parse(monthStart(position))) / 86400000
          )
        );
        schedule = add(schedule, {
          n: base * days,
          d: BigInt(life) * monthDays,
        });
        const target = rounded(schedule) > base ? base : rounded(schedule),
          delta = target - priorSchedule;
        priorSchedule = target;
        accumulated += delta;
        if (position >= from && delta > 0n)
          lines.push({
            batchId: batch.id,
            entityType: batch.entityType,
            entityId: batch.entityId,
            ...batch.identity,
            classificationId: batch.classificationId,
            unit,
            allocation: { ...allocation },
            from: start,
            to: previousDay(end),
            debit: amount(delta),
            expenseName: batch.rule.expenseName,
            accumulatedName: batch.rule.accumulatedName,
          });
      }
      position = end;
    }
    // A movement exactly on the report end date is processed by the loop above.
    balances.push({
      unit,
      cost: amount(cost),
      accumulated: amount(accumulated),
      impairment: amount(impairment),
      residual: amount(residual),
      net: amount(cost - accumulated - impairment),
      disposed,
      allocation,
    });
  }
  return { lines, units: balances };
}
