import { eq, and } from "drizzle-orm";
import {
  depreciationPolicies,
  depreciationBatches,
  depreciationMovements,
  depreciationPeriods,
  financialClassifications,
  assets,
  custodyItems,
  assetExclusions,
  warrantyReplacements,
} from "../drizzle/schema";
import {
  batchPayload,
  policyPayload,
  movementPayload,
  estimateHasCorrectionFields,
  calculateBatch,
  money,
  amount,
  previousDay,
  nextMonth,
  type FinancialBatch,
} from "../shared/depreciation";
import {
  jsonData,
  fail,
  sourceRecord,
  assertFutureDate,
  financialState,
  operationalSources,
  fingerprint,
} from "./depreciationStore";

export async function validatePolicy(tx: any, row: any) {
  const p = policyPayload.parse(jsonData(row.payload));
  if (row.effectiveDate < p.openingDate)
    fail("تاريخ سريان التهيئة لا يسبق بداية الوحدة");
  const classes = await tx.select().from(financialClassifications);
  for (const rule of p.rules)
    if (!classes.some((c: any) => c.id === rule.classificationId && c.active))
      fail("يوجد تصنيف غير نشط أو غير موجود");
  const approved = (await tx.select().from(depreciationPolicies)).filter(
    (r: any) => r.status === "APPROVED"
  );
  if (approved.some((r: any) => r.effectiveDate === row.effectiveDate))
    fail("توجد تهيئة معتمدة بنفس تاريخ السريان");
  if (approved.length) {
    const original = policyPayload.parse(jsonData(approved[0].payload));
    if (
      original.openingDate !== p.openingDate ||
      original.currency !== p.currency
    )
      fail(
        "لا يمكن تغيير عملة الوحدة أو تاريخ البداية بعد اعتماد التهيئة الأولى"
      );
    if (approved.some((r: any) => r.effectiveDate > row.effectiveDate))
      fail("التهيئة الجديدة يجب أن تسري بعد آخر تهيئة معتمدة");
  }
  await assertFutureDate(tx, row.effectiveDate);
  return p;
}

export async function validateBatch(tx: any, row: any) {
  const p = batchPayload.parse(jsonData(row.payload));
  if (p.sourceMovementId) fail("دفعة الضمان تنشأ من اعتماد معالجة الضمان فقط");
  const source = await sourceRecord(tx, row.entityType, row.entityId, true);
  if (
    source.classificationId &&
    source.classificationId !== row.classificationId
  )
    fail("التصنيف المالي لا يطابق تصنيف السجل");
  const policies = await tx.select().from(depreciationPolicies);
  const policy = policies.find((p: any) => p.id === row.policyId);
  if (!policy || policy.status !== "APPROVED") fail("اعتمد التهيئة أولاً");
  const setup = policyPayload.parse(jsonData(policy.payload));
  const rule = setup.rules.find(
    r => r.classificationId === row.classificationId
  );
  if (!rule) fail("التصنيف غير موجود في هذه التهيئة");
  if (rule.treatment === "EXPENSE")
    fail(
      "هذا التصنيف مصروف ولا يدخل سجل الأصول المالية؛ يظهر في تقرير الجاهزية بهذه المعالجة"
    );
  if (
    rule.treatment === "NON_DEPRECIABLE" &&
    money(p.openingAccumulated) !== 0n
  )
    fail("تصنيف غير قابل للإهلاك لا يحمل مجمع إهلاك");
  if (money(p.unitCost) < money(setup.capitalizationThreshold))
    fail("قيمة الوحدة أقل من حد الرسملة المعتمد");
  if (p.balanceDate < setup.openingDate) fail("تاريخ الرصيد يسبق بداية الوحدة");
  if (
    p.recognitionDate < setup.openingDate &&
    p.balanceDate !== setup.openingDate
  )
    fail("الأصل القديم يحتاج رصيداً افتتاحياً في تاريخ بداية الوحدة");
  if (
    p.availableForUseDate >= p.balanceDate &&
    money(p.openingAccumulated) > 0n
  )
    fail("لا يسجل مجمع افتتاحي قبل بدء الاستخدام");
  if (
    p.recognitionDate >= setup.openingDate &&
    (p.balanceDate !== p.recognitionDate ||
      money(p.openingAccumulated) !== 0n ||
      money(p.openingImpairment) !== 0n)
  )
    fail("الإضافة الجديدة تبدأ بتاريخ الاعتراف دون أرصدة افتتاحية");
  if (policy.effectiveDate > p.balanceDate)
    fail("التهيئة لم تكن سارية في تاريخ الرصيد");
  const effective = policies
    .filter(
      (r: any) => r.status === "APPROVED" && r.effectiveDate <= p.balanceDate
    )
    .sort((a: any, b: any) =>
      b.effectiveDate.localeCompare(a.effectiveDate)
    )[0];
  if (effective?.id !== row.policyId)
    fail("اختر التهيئة السارية في تاريخ الرصيد");
  const siblings = (
    await tx
      .select()
      .from(depreciationBatches)
      .where(
        and(
          eq(depreciationBatches.entityType, row.entityType),
          eq(depreciationBatches.entityId, row.entityId),
          eq(depreciationBatches.status, "APPROVED")
        )
      )
  ).filter(
    (r: any) =>
      r.id !== row.id &&
      r.status === "APPROVED" &&
      r.entityType === row.entityType &&
      r.entityId === row.entityId
  );
  let used = 0;
  for (const sibling of siblings) {
    const other = batchPayload.parse(jsonData(sibling.payload));
    used += other.quantity;
    if (other.units.some(u => p.units.includes(u)))
      fail("معرف وحدة مسجل سابقاً في دفعة معتمدة");
  }
  // The caller already holds the finance lock and the source row lock. Batch
  // capacity only needs its own disposal/warranty history, not every asset or ledger.
  const exclusions = await tx
    .select()
    .from(assetExclusions)
    .where(
      and(
        eq(assetExclusions.entityType, row.entityType),
        eq(assetExclusions.entityId, row.entityId)
      )
    )
    .orderBy(assetExclusions.id)
    .for("update");
  const warranties = await tx
    .select()
    .from(warrantyReplacements)
    .where(
      and(
        eq(warrantyReplacements.entityType, row.entityType),
        eq(warrantyReplacements.entityId, row.entityId),
        eq(warrantyReplacements.status, "EXECUTED")
      )
    )
    .orderBy(warrantyReplacements.id)
    .for("update");
  const firstBalance = [
    p.balanceDate,
    ...siblings.map(
      (s: any) => batchPayload.parse(jsonData(s.payload)).balanceDate
    ),
  ].sort()[0];
  const removedBeforeOpening = operationalSources({
    exclusions,
    warranties,
    transfers: [],
  })
    .filter(
      s =>
        s.entityType === row.entityType &&
        s.entityId === row.entityId &&
        s.effectiveDate < firstBalance &&
        ["DISPOSAL", "WARRANTY"].includes(s.kind)
    )
    .reduce((n, s) => n + s.quantity, 0);
  if (used + p.quantity > source.quantity - removedBeforeOpening)
    fail(
      "إجمالي وحدات الملفات المالية يتجاوز الوحدات القائمة عند تاريخ الرصيد الافتتاحي"
    );
  await assertFutureDate(tx, p.balanceDate);
  return { p, source, rule, setup };
}

export async function validateMovement(tx: any, row: any) {
  const state = await financialState(tx, true);
  const batch = state.batches.find(b => b.id === row.batchId);
  if (!batch) fail("الدفعة المالية غير معتمدة");
  const p = movementPayload.parse(jsonData(row.payload));
  if (!p.units.every(u => batch.payload.units.includes(u)))
    fail("الوحدات لا تتبع الدفعة");
  if (row.effectiveDate < batch.payload.balanceDate)
    fail("الحركة تسبق الرصيد الافتتاحي");
  if (
    state.movements.some(
      m =>
        m.batchId === row.batchId &&
        ["DISPOSAL", "WARRANTY"].includes(m.kind) &&
        m.payload.units.some(u => p.units.includes(u)) &&
        (m.effectiveDate <= row.effectiveDate ||
          ["DISPOSAL", "WARRANTY"].includes(row.kind))
    )
  )
    fail("الوحدة سبق إنهاء الاعتراف بها أو لها حركة إنهاء لاحقة متعارضة");
  if (
    state.movements.some(
      m =>
        m.batchId === row.batchId &&
        m.effectiveDate === row.effectiveDate &&
        m.payload.units.some(u => p.units.includes(u))
    )
  )
    fail("حركتان لنفس الوحدة في نفس اليوم؛ حدد التسلسل بمراجعة مالية مستقلة");
  const operational = operationalSources(state);
  if (row.kind === "ESTIMATE" || row.kind === "CORRECTION") {
    if (row.sourceKey || !p.remainingLifeMonths || p.unitResidual === undefined)
      fail(
        "تغيير التقدير يحتاج العمر المتبقي والقيمة المتبقية، دون رابط حركة تشغيلية"
      );
    if (row.kind === "ESTIMATE" && estimateHasCorrectionFields(p))
      fail("تغيير التقدير لا يغير التكلفة أو المجمع؛ استخدم حركة تصحيح مستقلة");
    if (!row.effectiveDate.endsWith("-01"))
      fail("تغيير التقدير يسري من بداية شهر ضمن هذه الوحدة");
    if (row.kind === "CORRECTION") {
      if (
        p.unitCost === undefined ||
        p.unitAccumulated === undefined ||
        p.unitImpairment === undefined ||
        !p.correctionAccount
      )
        fail(
          "التصحيح يحتاج تكلفة الوحدة والمجمع وانخفاض القيمة والحساب المقابل بمستند معتمد"
        );
      if (
        money(p.unitCost) === 0n ||
        money(p.unitAccumulated) +
          money(p.unitImpairment) +
          money(p.unitResidual) >
          money(p.unitCost)
      )
        fail("أرصدة التصحيح لا تتوافق مع التكلفة والقيمة المتبقية");
    }
  } else {
    const source = operational.find(s => s.sourceKey === row.sourceKey);
    if (
      !source ||
      source.entityType !== batch.entityType ||
      source.entityId !== batch.entityId ||
      source.kind !== row.kind ||
      source.effectiveDate !== row.effectiveDate
    )
      fail(
        "الحركة المالية يجب أن ترتبط بالحركة التشغيلية الصحيحة وتاريخ سريانها"
      );
    const covered = state.movements
      .filter(
        m =>
          state.movementRows.find((r: any) => r.id === m.id)?.sourceKey ===
          row.sourceKey
      )
      .reduce((n, m) => n + m.payload.units.length, 0);
    if (covered + p.units.length > source.quantity)
      fail("عدد الوحدات يتجاوز الكمية بالحركة التشغيلية");
    if (row.kind === "TRANSFER" && !p.allocation)
      fail("أكمل مركز التكلفة والتخصيص الجديد");
    if (row.kind === "WARRANTY") {
      if (
        !p.replacement ||
        p.replacement.entityId !== source.replacementEntityId ||
        p.replacement.units.length !== p.units.length ||
        new Set(p.replacement.units).size !== p.replacement.units.length
      )
        fail("أكمل وحدات البديل واربطها بسجل الضمان الصحيح");
      if (p.replacement.availableForUseDate < row.effectiveDate)
        fail("جاهزية البديل لا تسبق استلامه");
      const dest = await sourceRecord(
        tx,
        batch.entityType,
        p.replacement.entityId,
        true
      );
      const existing = state.batches.filter(
        b => b.entityType === batch.entityType && b.entityId === dest.id
      );
      if (
        existing.reduce((n, b) => n + b.payload.quantity, 0) + p.units.length >
          dest.quantity ||
        existing.some(b =>
          b.payload.units.some(u => p.replacement!.units.includes(u))
        )
      )
        fail("البديل لديه ملف مالي متعارض");
      if (money(p.proceeds) !== 0n) fail("استبدال الضمان لا يسجل حصيلة بيع");
    }
  }
  if (!["DISPOSAL"].includes(row.kind) && money(p.proceeds) !== 0n)
    fail("الحصيلة تخص الاستبعاد فقط");
  if (row.kind === "ESTIMATE" || row.kind === "CORRECTION") {
    // Approved journals and warranty opening balances are immutable snapshots.
    // Changing their earlier inputs would require a separate reversal workflow.
    if (
      state.movements.some(
        m =>
          m.batchId === row.batchId &&
          m.effectiveDate > row.effectiveDate &&
          ["CORRECTION", "DISPOSAL", "WARRANTY"].includes(m.kind) &&
          m.payload.units.some(u => p.units.includes(u))
      )
    )
      fail(
        "لا يمكن تغيير أرصدة تسبق حركة محاسبية معتمدة لنفس الوحدة؛ يلزم تصحيح مستقل بتاريخ لاحق"
      );
    // Check effective per-unit cost, including prior corrections. Recheck later
    // estimates so a backdated correction cannot invalidate approved history.
    const timeline = [
      ...state.movements,
      {
        id: row.id,
        batchId: row.batchId,
        kind: row.kind,
        effectiveDate: row.effectiveDate,
        payload: p,
      },
    ];
    const estimates = timeline.filter(
      m =>
        m.batchId === row.batchId &&
        m.kind === "ESTIMATE" &&
        m.effectiveDate >= row.effectiveDate &&
        m.payload.units.some(u => p.units.includes(u))
    );
    for (const estimate of estimates) {
      const balances = calculateBatch(
        batch,
        timeline,
        "1900-01-01",
        previousDay(estimate.effectiveDate)
      ).units;
      if (
        estimate.payload.unitResidual === undefined ||
        balances.some(
          unit =>
            estimate.payload.units.includes(unit.unit) &&
            money(estimate.payload.unitResidual!) > money(unit.cost)
        )
      )
        fail(
          "القيمة المتبقية للتقدير تتجاوز التكلفة الفعلية لوحدة في تاريخ سريانه"
        );
    }
  }
  await assertFutureDate(tx, row.effectiveDate);
  return { state, batch, p };
}

export function previewPeriod(
  state: Awaited<ReturnType<typeof financialState>>,
  month: string
) {
  const from = `${month}-01`,
    to = previousDay(nextMonth(from));
  const policy = state.policies
    .filter((p: any) => p.status === "APPROVED" && p.effectiveDate <= from)
    .sort((a: any, b: any) =>
      b.effectiveDate.localeCompare(a.effectiveDate)
    )[0];
  if (!policy) fail("لا توجد تهيئة معتمدة سارية لهذه الفترة");
  const setup = policyPayload.parse(jsonData(policy.payload));
  if (from < setup.openingDate) fail("الفترة تسبق بداية الوحدة");
  const exceptions: Array<{
    entityType: string;
    entityId: number;
    code: string;
    name: string;
    reason: string;
  }> = [];
  for (const kind of ["asset", "custody"] as const)
    for (const source of kind === "asset"
      ? state.assetRows
      : state.custodyRows) {
      if (["DRAFT", "CANCELLED"].includes(source.status)) continue;
      const mapped = state.batches.filter(
        b => b.entityType === kind && b.entityId === source.id
      );
      const firstBalance =
        mapped.map(b => b.payload.balanceDate).sort()[0] ?? setup.openingDate;
      const removedBeforeOpening = operationalSources(state)
        .filter(
          s =>
            s.entityType === kind &&
            s.entityId === source.id &&
            s.effectiveDate < firstBalance &&
            ["DISPOSAL", "WARRANTY"].includes(s.kind)
        )
        .reduce((n, s) => n + s.quantity, 0);
      const rule = setup.rules.find(
        r => r.classificationId === source.classificationId
      );
      const exception = (reason: string) =>
        exceptions.push({
          entityType: kind,
          entityId: source.id,
          code: source.assetCode ?? source.code ?? `#${source.id}`,
          name: source.assetName ?? source.name,
          reason,
        });
      if (!source.classificationId) exception("التصنيف المالي غير محدد");
      else if (!rule) exception("التصنيف غير مهيأ");
      else if (
        rule.treatment !== "EXPENSE" &&
        mapped.reduce((n, b) => n + b.payload.quantity, 0) !==
          source.quantity - removedBeforeOpening
      )
        exception(
          "الوحدات القائمة عند بداية الملف غير مغطاة بالكامل بملفات مالية معتمدة"
        );
    }
  for (const source of operationalSources(state).filter(
    s => s.effectiveDate <= to
  )) {
    const batches = state.batches.filter(
      b => b.entityType === source.entityType && b.entityId === source.entityId
    );
    if (!batches.length) continue;
    const first = batches.map(b => b.payload.balanceDate).sort()[0];
    // Approved opening profiles certify only units still recognized at their balance date.
    if (source.effectiveDate < first) continue;
    const reviewed = state.movements
      .filter(
        m =>
          state.movementRows.find((r: any) => r.id === m.id)?.sourceKey ===
          source.sourceKey
      )
      .reduce((n, m) => n + m.payload.units.length, 0);
    if (reviewed !== source.quantity)
      exceptions.push({
        entityType: source.entityType,
        entityId: source.entityId,
        code: source.sourceKey,
        name: source.description,
        reason: "الحركة التشغيلية غير مراجعة مالياً بالكامل",
      });
  }
  const lines = state.batches
    .filter(b => b.payload.balanceDate <= to)
    .flatMap(b => calculateBatch(b, state.movements, from, to).lines);
  const total = amount(lines.reduce((n, l) => n + money(l.debit), 0n));
  const snapshot = {
    from,
    to,
    currency: setup.currency,
    organizationName: setup.organizationName,
    lines,
    total,
    exceptions,
  };
  // Snapshot the full source set, including operational events, not only the computed total.
  const inputHash = fingerprint({
    policies: state.policies.filter((r: any) => r.status === "APPROVED"),
    batches: state.batches,
    movements: state.movements,
    sources: operationalSources(state),
    assets: state.assetRows,
    custody: state.custodyRows,
  });
  return { snapshot, inputHash, setup };
}

export function journalLines(
  lines: ReturnType<typeof calculateBatch>["lines"],
  narration: string
) {
  const grouped = new Map<
    string,
    {
      account: string;
      costCenter: string;
      classification: string;
      debit: bigint;
      credit: bigint;
      narration: string;
    }
  >();
  for (const l of lines)
    for (const debit of [true, false]) {
      const account = debit ? l.expenseName : l.accumulatedName,
        key = JSON.stringify([
          account,
          l.allocation.costCenter,
          l.classification,
          debit,
        ]);
      const item = grouped.get(key) ?? {
        account,
        costCenter: l.allocation.costCenter,
        classification: l.classification,
        debit: 0n,
        credit: 0n,
        narration: `${narration} — ${l.classification}`,
      };
      item[debit ? "debit" : "credit"] += money(l.debit);
      grouped.set(key, item);
    }
  return [...grouped.values()].map(l => ({
    ...l,
    debit: amount(l.debit),
    credit: amount(l.credit),
  }));
}
export function assertBalanced(
  lines: Array<{ debit: string; credit: string }>
) {
  const debit = lines.reduce((n, l) => n + money(l.debit), 0n),
    credit = lines.reduce((n, l) => n + money(l.credit), 0n);
  if (debit !== credit) fail("القيد غير متوازن");
  return amount(debit);
}
