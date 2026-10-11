import { z } from "zod";
import { eq, getTableName, getTableColumns, inArray, sql } from "drizzle-orm";
import { operatorProcedure, approvalProcedure, router } from "./_core/trpc";
import {
  assets,
  custodyItems,
  financialClassifications,
  depreciationPolicies,
  depreciationBatches,
  depreciationMovements,
  depreciationPeriods,
  depreciationJournals,
  depreciationExports,
  users,
} from "../drizzle/schema";
import {
  financialDate,
  policyPayload,
  batchPayload,
  movementPayload,
  estimateHasCorrectionFields,
  calculateBatch,
  money,
  amount,
  previousDay,
  nextMonth,
  periodTitle,
  type FinancialBatch,
} from "../shared/depreciation";
import {
  database,
  lockFinance,
  bumpFinance,
  lockDocument,
  requireDraft,
  separateApprover,
  financialAudit,
  jsonData,
  fail,
  financialState,
  operationalSources,
  fingerprint,
  sourceRecord,
} from "./depreciationStore";
import {
  validatePolicy,
  validateBatch,
  validateMovement,
  previewPeriod,
  journalLines,
  assertBalanced,
} from "./depreciationWorkflow";
import { depreciationReport } from "./depreciationReports";
import { financialExcel } from "./depreciationExcel";

const reviewed = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
});
const draftIdentity = z.object({
  id: z.number().int().positive().optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
});
const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine(v => v >= "1900-01" && v <= "2200-12");
const range = z
  .object({ from: financialDate, to: financialDate })
  .refine(p => p.from <= p.to, "نهاية الفترة تسبق بدايتها");
const documentKind = z.enum(["policy", "batch", "movement"]);
const tables = {
  policy: depreciationPolicies,
  batch: depreciationBatches,
  movement: depreciationMovements,
};
async function save(
  tx: any,
  ctx: any,
  table: any,
  input: { id?: number; expectedVersion?: number },
  data: any
) {
  let id = input.id,
    old: any = null;
  if (id) {
    if (input.expectedVersion === undefined) fail("إصدار المسودة مطلوب");
    old = await lockDocument(tx, table, id, input.expectedVersion);
    requireDraft(old);
    await tx
      .update(table)
      .set({
        ...data,
        version: old.version + 1,
        updatedBy: ctx.user.id,
        reviewNote: null,
      })
      .where(eq(table.id, id));
  } else {
    const result = await tx.insert(table).values({
      ...data,
      status: "DRAFT",
      version: 0,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    });
    id = Number(result[0].insertId);
  }
  await financialAudit(
    tx,
    ctx,
    getTableName(table),
    id!,
    old ? "FINANCE_EDIT" : "FINANCE_DRAFT",
    old,
    data
  );
  await bumpFinance(tx);
  return { id };
}
async function addJournal(
  tx: any,
  ctx: any,
  data: {
    sourceKey: string;
    periodId?: number;
    movementId?: number;
    effectiveDate: string;
    kind: string;
    snapshot: any;
  }
) {
  assertBalanced(data.snapshot.lines);
  const code = `DEP-${data.effectiveDate.replaceAll("-", "")}-${data.sourceKey.replaceAll(":", "-")}`;
  await tx
    .insert(depreciationJournals)
    .values({ ...data, code, approvedBy: ctx.user.id });
  return code;
}

export const depreciationRouter = router({
  assignClassification: approvalProcedure
    .input(
      z.object({
        entityType: z.enum(["asset", "custody"]),
        entityId: z.number().int().positive(),
        classificationId: z.number().int().positive(),
        expectedClassificationId: z.number().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const source = await sourceRecord(
          tx,
          input.entityType,
          input.entityId,
          true
        );
        if (
          (source.classificationId ?? null) !== input.expectedClassificationId
        )
          fail("تغير تصنيف السجل؛ حدّث الصفحة", "CONFLICT");
        const [classification] = await tx
          .select()
          .from(financialClassifications)
          .where(eq(financialClassifications.id, input.classificationId));
        if (!classification?.active) fail("التصنيف غير نشط أو غير موجود");
        const batches = await tx.select().from(depreciationBatches);
        if (
          batches.some(
            (b: any) =>
              b.status === "APPROVED" &&
              b.entityType === input.entityType &&
              b.entityId === input.entityId &&
              b.classificationId !== input.classificationId
          )
        )
          fail("لا يمكن تغيير تصنيف ملف مالي معتمد مباشرة");
        const table = input.entityType === "asset" ? assets : custodyItems;
        await tx
          .update(table)
          .set({ classificationId: input.classificationId })
          .where(eq(table.id, input.entityId));
        await financialAudit(
          tx,
          ctx,
          getTableName(table),
          input.entityId,
          "FINANCE_CLASSIFY",
          source,
          {
            ...source,
            entityType: input.entityType,
            entityId: input.entityId,
            classificationId: input.classificationId,
            classificationName: classification.name,
          }
        );
        await bumpFinance(tx);
        return { success: true };
      });
    }),
  classifications: operatorProcedure.query(async () =>
    (await database())
      .select()
      .from(financialClassifications)
      .orderBy(financialClassifications.id)
  ),
  createClassification: operatorProcedure
    .input(
      z
        .object({
          code: z
            .string()
            .trim()
            .min(1)
            .max(40)
            .regex(/^[A-Za-z0-9_-]+$/),
          name: z.string().trim().min(1).max(255),
        })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const inserted = await tx
          .insert(financialClassifications)
          .values({ ...input, code: input.code.toUpperCase() });
        const id = Number(inserted[0].insertId);
        await financialAudit(
          tx,
          ctx,
          "financial_classifications",
          id,
          "FINANCE_CLASSIFY",
          null,
          input
        );
        await bumpFinance(tx);
        return { id };
      });
    }),
  workspace: operatorProcedure.query(async () => {
    const db = await database();
    // Large immutable snapshots are fetched only when their details are opened.
    const { snapshot: periodSnapshot, ...periodColumns } = getTableColumns(depreciationPeriods);
    const { snapshot: journalSnapshot, ...journalColumns } = getTableColumns(depreciationJournals);
    const { snapshot: _exportSnapshot, ...exportColumns } = getTableColumns(depreciationExports);
    const [state, periods, journals, exports] = await Promise.all([
      financialState(db),
      db.select({ ...periodColumns, snapshot: sql`JSON_OBJECT('total', JSON_EXTRACT(${periodSnapshot}, '$.total'), 'currency', JSON_EXTRACT(${periodSnapshot}, '$.currency'), 'exceptionCount', COALESCE(JSON_LENGTH(JSON_EXTRACT(${periodSnapshot}, '$.exceptions')), 0))` }).from(depreciationPeriods),
      db.select({ ...journalColumns, snapshot: sql`JSON_OBJECT('lines', JSON_EXTRACT(${journalSnapshot}, '$.lines'))` }).from(depreciationJournals),
      db.select(exportColumns).from(depreciationExports),
    ]);
    const actorIds = [...new Set(
      [...state.policies, ...state.rows, ...state.movementRows, ...periods, ...journals, ...exports]
        .flatMap((row: any) => [row.createdBy, row.updatedBy, row.approvedBy, row.exportedBy])
        .filter((id): id is number => typeof id === "number")
    )];
    const actors = actorIds.length
      ? await db.select({ id: users.id, name: users.name, username: users.username })
          .from(users).where(inArray(users.id, actorIds))
      : [];
    const actorNames = new Map(actors.map(actor => [actor.id, actor.name || actor.username]));
    const withActorNames = (rows: any[]) => rows.map(row => ({
      ...row,
      createdByName: actorNames.get(row.createdBy),
      updatedByName: actorNames.get(row.updatedBy),
      approvedByName: actorNames.get(row.approvedBy),
      exportedByName: actorNames.get(row.exportedBy),
    }));
    return {
      classes: state.classes,
      policies: withActorNames(state.policies),
      batches: withActorNames(state.rows),
      movements: withActorNames(state.movementRows),
      periods: withActorNames(periods),
      journals: withActorNames(journals),
      exports: withActorNames(exports),
      sources: operationalSources(state),
      records: [
        ...state.assetRows.map((r: any) => ({
          ...r,
          entityType: "asset",
          name: r.assetName,
          code: r.assetCode,
        })),
        ...state.custodyRows.map((r: any) => ({ ...r, entityType: "custody" })),
      ].filter((r: any) => !["DRAFT", "CANCELLED"].includes(r.status)),
    };
  }),
  periodDetails: operatorProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await database();
    const [row] = await db.select().from(depreciationPeriods).where(eq(depreciationPeriods.id, input.id));
    if (!row) fail("دورة الإهلاك غير موجودة");
    return row;
  }),
  savePolicy: operatorProcedure
    .input(
      draftIdentity
        .extend({ effectiveDate: financialDate, payload: policyPayload })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        return save(tx, ctx, depreciationPolicies, input, {
          effectiveDate: input.effectiveDate,
          payload: input.payload,
        });
      });
    }),
  saveBatch: operatorProcedure
    .input(
      draftIdentity
        .extend({
          entityType: z.enum(["asset", "custody"]),
          entityId: z.number().int().positive(),
          classificationId: z.number().int().positive(),
          policyId: z.number().int().positive(),
          payload: batchPayload,
        })
        .strict()
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        await sourceRecord(tx, input.entityType, input.entityId, true);
        const { id, expectedVersion, ...data } = input;
        return save(tx, ctx, depreciationBatches, input, data);
      });
    }),
  saveMovement: operatorProcedure
    .input(
      draftIdentity
        .extend({
          batchId: z.number().int().positive(),
          kind: z.enum([
            "DISPOSAL",
            "WARRANTY",
            "TRANSFER",
            "ESTIMATE",
            "CORRECTION",
          ]),
          effectiveDate: financialDate,
          sourceKey: z.string().max(100).nullable(),
          payload: movementPayload,
        })
        .strict()
        .superRefine((input, ctx) => {
          if (
            input.kind === "ESTIMATE" &&
            estimateHasCorrectionFields(input.payload)
          )
            ctx.addIssue({
              code: "custom",
              path: ["payload"],
              message:
                "تغيير التقدير لا يغير التكلفة أو المجمع؛ استخدم حركة تصحيح مستقلة",
            });
        })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const { id, expectedVersion, ...data } = input;
        return save(tx, ctx, depreciationMovements, input, data);
      });
    }),
  previewDocument: operatorProcedure
    .input(reviewed.extend({ kind: documentKind }))
    .mutation(async ({ input }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          tables[input.kind],
          input.id,
          input.expectedVersion
        );
        requireDraft(row);
        if (input.kind === "policy") await validatePolicy(tx, row);
        else if (input.kind === "batch") await validateBatch(tx, row);
        else await validateMovement(tx, row);
        return { valid: true, payload: jsonData(row.payload) };
      });
    }),
  submitDocument: operatorProcedure
    .input(reviewed.extend({ kind: documentKind }))
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const table = tables[input.kind],
          row = await lockDocument(tx, table, input.id, input.expectedVersion);
        requireDraft(row);
        if (input.kind === "policy") await validatePolicy(tx, row);
        else if (input.kind === "batch") await validateBatch(tx, row);
        else await validateMovement(tx, row);
        await tx
          .update(table)
          .set({ status: "SUBMITTED", version: row.version + 1 })
          .where(eq(table.id, row.id));
        await financialAudit(
          tx,
          ctx,
          getTableName(table),
          row.id,
          "FINANCE_SUBMIT",
          row,
          { ...row, status: "SUBMITTED" }
        );
        await bumpFinance(tx);
        return { success: true };
      });
    }),
  returnDocument: approvalProcedure
    .input(
      reviewed.extend({
        kind: documentKind,
        note: z.string().trim().min(1).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const table = tables[input.kind],
          row = await lockDocument(tx, table, input.id, input.expectedVersion);
        if (row.status !== "SUBMITTED") fail("السجل ليس قيد المراجعة");
        await tx
          .update(table)
          .set({
            status: "DRAFT",
            version: row.version + 1,
            reviewNote: input.note,
          })
          .where(eq(table.id, row.id));
        await financialAudit(
          tx,
          ctx,
          getTableName(table),
          row.id,
          "FINANCE_RETURN",
          row,
          { note: input.note }
        );
        await bumpFinance(tx);
        return { success: true };
      });
    }),
  approveDocument: approvalProcedure
    .input(reviewed.extend({ kind: documentKind }))
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const table = tables[input.kind],
          row = await lockDocument(tx, table, input.id, input.expectedVersion);
        if (row.status !== "SUBMITTED") fail("أرسل المسودة للمراجعة أولاً");
        separateApprover(row, ctx);
        if (input.kind === "policy") await validatePolicy(tx, row);
        if (input.kind === "batch") {
          await validateBatch(tx, row);
          const entityTable =
            row.entityType === "asset" ? assets : custodyItems;
          await tx
            .update(entityTable)
            .set({ classificationId: row.classificationId })
            .where(eq(entityTable.id, row.entityId));
        }
        if (input.kind === "movement") {
          const { state, batch, p } = await validateMovement(tx, row);
          if (row.kind === "CORRECTION") {
            const before = calculateBatch(
              batch,
              state.movements,
              "1900-01-01",
              previousDay(row.effectiveDate)
            ).units.filter(u => p.units.includes(u.unit));
            const details = before.map(u => ({
              batchId: batch.id,
              unit: u.unit,
              costDelta: amount(money(p.unitCost!) - money(u.cost)),
              accumDelta: amount(
                money(p.unitAccumulated!) - money(u.accumulated)
              ),
              impairmentDelta: amount(
                money(p.unitImpairment!) - money(u.impairment)
              ),
              before: u,
              after: {
                cost: p.unitCost,
                accumulated: p.unitAccumulated,
                impairment: p.unitImpairment,
              },
            }));
            const lines: any[] = [];
            let balance = 0n;
            const push = (
              account: string,
              delta: bigint,
              debitPositive: boolean
            ) => {
              if (delta === 0n) return;
              const debit = debitPositive ? delta : -delta;
              balance += debit;
              lines.push({
                account,
                debit: amount(debit > 0n ? debit : 0n),
                credit: amount(debit < 0n ? -debit : 0n),
                classification: batch.identity.classification,
                costCenter: batch.payload.allocation.costCenter,
                narration: `تصحيح بيانات مالي: ${batch.identity.code} — ${p.reason}`,
              });
            };
            const sum = (key: "cost" | "accumulated" | "impairment") =>
              before.reduce((n, u) => n + money(u[key]), 0n);
            push(
              batch.rule.costName,
              money(p.unitCost!) * BigInt(before.length) - sum("cost"),
              true
            );
            push(
              batch.rule.accumulatedName,
              money(p.unitAccumulated!) * BigInt(before.length) -
                sum("accumulated"),
              false
            );
            push(
              `مجمع انخفاض قيمة ${batch.identity.classification}`,
              money(p.unitImpairment!) * BigInt(before.length) -
                sum("impairment"),
              false
            );
            const counterpart = -balance;
            push(p.correctionAccount!, counterpart, true);
            await addJournal(tx, ctx, {
              sourceKey: `movement:${row.id}`,
              movementId: row.id,
              effectiveDate: row.effectiveDate,
              kind: "CORRECTION",
              snapshot: {
                lines,
                details,
                reason: p.reason,
                documentReference: p.documentReference,
                currency: policyPayload.parse(
                  jsonData(
                    state.policies.find((r: any) => r.id === batch.policyId)!
                      .payload
                  )
                ).currency,
              },
            });
          }
          if (row.kind === "DISPOSAL" || row.kind === "WARRANTY") {
            const balances = calculateBatch(
              batch,
              state.movements,
              "1900-01-01",
              previousDay(row.effectiveDate)
            ).units.filter(u => p.units.includes(u.unit));
            const sum = (key: "cost" | "accumulated" | "impairment" | "net") =>
              balances.reduce((n, u) => n + money(u[key]), 0n);
            const cost = sum("cost"),
              accum = sum("accumulated"),
              impairment = sum("impairment"),
              net = sum("net"),
              proceeds = money(p.proceeds);
            const lines: Array<{
              account: string;
              debit: string;
              credit: string;
              costCenter: string;
              narration: string;
              classification: string;
            }> = [];
            const push = (account: string, debit: bigint, credit: bigint) => {
              if (debit || credit)
                lines.push({
                  account,
                  debit: amount(debit),
                  credit: amount(credit),
                  costCenter: batch.payload.allocation.costCenter,
                  narration: `${row.kind === "DISPOSAL" ? "استبعاد" : "استبدال ضمان"}: ${batch.identity.code} — ${p.reason}`,
                  classification: batch.identity.classification,
                });
            };
            push(batch.rule.accumulatedName, accum, 0n);
            push(
              `مجمع انخفاض قيمة ${batch.identity.classification}`,
              impairment,
              0n
            );
            push(batch.rule.costName, 0n, cost);
            if (row.kind === "DISPOSAL") {
              push("متحصلات استبعاد الأصول", proceeds, 0n);
              if (net >= proceeds)
                push("خسائر استبعاد الأصول", net - proceeds, 0n);
              else push("أرباح استبعاد الأصول", 0n, proceeds - net);
            } else {
              const replacement = p.replacement!;
              // Preserve gross cost and accumulated depreciation. Warranty does not create a new purchase value or restart life.
              for (let index = 0; index < balances.length; index++) {
                const unit = balances[index];
                const parsed = batchPayload.safeParse({
                  ...batch.payload,
                  label: `بديل ضمان ${row.id} / ${replacement.units[index]}`,
                  quantity: 1,
                  unitCost: unit.cost,
                  openingAccumulated: unit.accumulated,
                  openingImpairment: unit.impairment,
                  unitResidual: unit.residual,
                  recognitionDate: batch.payload.recognitionDate,
                  balanceDate: row.effectiveDate,
                  availableForUseDate: replacement.availableForUseDate,
                  lifeMonths: replacement.remainingLifeMonths,
                  units: [replacement.units[index]],
                  allocation: replacement.allocation,
                  documentReference: p.documentReference,
                  sourceMovementId: row.id,
                  notes: `استمرار القيمة الدفترية من الدفعة ${batch.id} / ${unit.unit}`,
                });
                if (!parsed.success)
                  fail(
                    "أرصدة بديل الضمان غير صحيحة؛ راجع التقديرات والتصحيحات المعتمدة"
                  );
                const payload = parsed.data;
                await tx.insert(depreciationBatches).values({
                  entityType: batch.entityType,
                  entityId: replacement.entityId,
                  classificationId: batch.classificationId,
                  policyId: batch.policyId,
                  status: "APPROVED",
                  version: 0,
                  payload,
                  createdBy: row.createdBy,
                  updatedBy: row.updatedBy,
                  approvedBy: ctx.user.id,
                  approvedAt: new Date(),
                });
              }
              const entityTable =
                batch.entityType === "asset" ? assets : custodyItems;
              await tx
                .update(entityTable)
                .set({ classificationId: batch.classificationId })
                .where(eq(entityTable.id, replacement.entityId));
              push(`${batch.rule.costName} — البديل`, cost, 0n);
              push(`${batch.rule.accumulatedName} — البديل`, 0n, accum);
              push(
                `مجمع انخفاض قيمة ${batch.identity.classification} — البديل`,
                0n,
                impairment
              );
            }
            await addJournal(tx, ctx, {
              sourceKey: `movement:${row.id}`,
              movementId: row.id,
              effectiveDate: row.effectiveDate,
              kind: row.kind,
              snapshot: {
                lines,
                details: {
                  batch,
                  units: balances,
                  movement: { ...row, payload: p },
                },
                currency: policyPayload.parse(
                  jsonData(
                    state.policies.find((s: any) => s.id === batch.policyId)!
                      .payload
                  )
                ).currency,
              },
            });
          }
        }
        await tx
          .update(table)
          .set({
            status: "APPROVED",
            version: row.version + 1,
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(table.id, row.id));
        await financialAudit(
          tx,
          ctx,
          getTableName(table),
          row.id,
          "FINANCE_APPROVE",
          row,
          { ...row, status: "APPROVED", approvedBy: ctx.user.id }
        );
        await bumpFinance(tx);
        return { success: true };
      });
    }),
  previewPeriod: operatorProcedure
    .input(z.object({ month }))
    .mutation(async ({ input }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        return previewPeriod(await financialState(tx, true), input.month);
      });
    }),
  savePeriod: operatorProcedure
    .input(
      z.object({
        month,
        expectedVersion: z.number().int().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const [old] = await tx
          .select()
          .from(depreciationPeriods)
          .where(eq(depreciationPeriods.month, input.month))
          .for("update");
        if (old) {
          requireDraft(old);
          if (input.expectedVersion !== old.version)
            fail("تغيرت دورة الإهلاك؛ حدّث الصفحة", "CONFLICT");
        }
        const calculated = previewPeriod(
          await financialState(tx, true),
          input.month
        );
        let id: number;
        if (old) {
          id = old.id;
          await tx
            .update(depreciationPeriods)
            .set({
              snapshot: calculated.snapshot,
              inputHash: calculated.inputHash,
              updatedBy: ctx.user.id,
              version: old.version + 1,
              reviewNote: null,
            })
            .where(eq(depreciationPeriods.id, id));
        } else {
          const inserted = await tx.insert(depreciationPeriods).values({
            month: input.month,
            status: "DRAFT",
            version: 0,
            snapshot: calculated.snapshot,
            inputHash: calculated.inputHash,
            createdBy: ctx.user.id,
            updatedBy: ctx.user.id,
          });
          id = Number(inserted[0].insertId);
        }
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          id,
          "DEPRECIATION_DRAFT",
          old,
          calculated.snapshot
        );
        return { id };
      });
    }),
  submitPeriod: operatorProcedure
    .input(reviewed)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          depreciationPeriods,
          input.id,
          input.expectedVersion
        );
        requireDraft(row);
        const calculated = previewPeriod(
          await financialState(tx, true),
          row.month
        );
        if (calculated.inputHash !== row.inputHash)
          fail("تغيرت البيانات؛ أعد الاحتساب والحفظ قبل الإرسال", "CONFLICT");
        if (calculated.snapshot.exceptions.length)
          fail("عالج نواقص الجاهزية والحركات قبل الإرسال");
        await tx
          .update(depreciationPeriods)
          .set({ status: "SUBMITTED", version: row.version + 1 })
          .where(eq(depreciationPeriods.id, row.id));
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          row.id,
          "DEPRECIATION_SUBMIT",
          row,
          { status: "SUBMITTED" }
        );
        return { success: true };
      });
    }),
  returnPeriod: approvalProcedure
    .input(reviewed.extend({ note: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          depreciationPeriods,
          input.id,
          input.expectedVersion
        );
        if (row.status !== "SUBMITTED") fail("الدورة ليست قيد المراجعة");
        await tx
          .update(depreciationPeriods)
          .set({
            status: "DRAFT",
            version: row.version + 1,
            reviewNote: input.note,
          })
          .where(eq(depreciationPeriods.id, row.id));
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          row.id,
          "DEPRECIATION_RETURN",
          row,
          { note: input.note }
        );
        return { success: true };
      });
    }),
  approvePeriod: approvalProcedure
    .input(reviewed)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          depreciationPeriods,
          input.id,
          input.expectedVersion
        );
        if (row.status !== "SUBMITTED") fail("أرسل الدورة للمراجعة أولاً");
        separateApprover(row, ctx);
        const calculated = previewPeriod(
          await financialState(tx, true),
          row.month
        );
        if (calculated.inputHash !== row.inputHash)
          fail(
            "تغيرت مصادر الحساب؛ أعد الدورة للمحاسب لإعادة احتسابها",
            "CONFLICT"
          );
        if (calculated.snapshot.exceptions.length)
          fail("توجد نواقص تمنع الاعتماد");
        if (
          calculated.snapshot.to >
          new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" })
        )
          fail(
            "يمكن حفظ ومعاينة الشهر الجاري؛ الاعتماد النهائي بعد نهاية الشهر"
          );
        const periods = await tx.select().from(depreciationPeriods);
        for (
          let cursor = calculated.setup.openingDate;
          cursor < `${row.month}-01`;
          cursor = nextMonth(cursor)
        )
          if (
            !periods.some(
              (p: any) =>
                p.month === cursor.slice(0, 7) &&
                ["APPROVED", "CLOSED"].includes(p.status)
            )
          )
            fail(`اعتمد شهر ${cursor.slice(0, 7)} أولاً`);
        const lines = journalLines(
          calculated.snapshot.lines,
          `إثبات مصروف الإهلاك لشهر ${new Intl.DateTimeFormat("ar", { month: "long", timeZone: "UTC" }).format(new Date(`${row.month}-01T00:00:00Z`))} ${row.month.slice(0, 4)}`
        );
        if (assertBalanced(lines) !== calculated.snapshot.total)
          fail("تفاصيل الإهلاك لا تطابق القيد");
        const code = await addJournal(tx, ctx, {
          sourceKey: `period:${row.id}:${row.version}`,
          periodId: row.id,
          effectiveDate: calculated.snapshot.to,
          kind: "DEPRECIATION",
          snapshot: {
            ...calculated.snapshot,
            lines,
            details: calculated.snapshot.lines,
          },
        });
        await tx
          .update(depreciationPeriods)
          .set({
            status: "APPROVED",
            version: row.version + 1,
            approvedBy: ctx.user.id,
            approvedAt: new Date(),
          })
          .where(eq(depreciationPeriods.id, row.id));
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          row.id,
          "DEPRECIATION_APPROVE",
          row,
          { code, snapshot: calculated.snapshot }
        );
        return { success: true, code };
      });
    }),
  closePeriod: approvalProcedure
    .input(reviewed)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          depreciationPeriods,
          input.id,
          input.expectedVersion
        );
        if (row.status !== "APPROVED") fail("اعتمد الدورة قبل الإقفال");
        const periods = await tx.select().from(depreciationPeriods);
        if (
          periods.some((p: any) => p.month < row.month && p.status !== "CLOSED")
        )
          fail("أقفل الفترات السابقة أولاً");
        await tx
          .update(depreciationPeriods)
          .set({
            status: "CLOSED",
            version: row.version + 1,
            closedBy: ctx.user.id,
            closedAt: new Date(),
          })
          .where(eq(depreciationPeriods.id, row.id));
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          row.id,
          "DEPRECIATION_CLOSE",
          row,
          { status: "CLOSED" }
        );
        return { success: true };
      });
    }),
  reversePeriod: approvalProcedure
    .input(reviewed.extend({ reason: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const row = await lockDocument(
          tx,
          depreciationPeriods,
          input.id,
          input.expectedVersion
        );
        if (row.status !== "APPROVED") fail("يمكن عكس فترة معتمدة مفتوحة فقط");
        const periods = await tx.select().from(depreciationPeriods);
        if (
          periods.some(
            (p: any) =>
              p.month > row.month && ["APPROVED", "CLOSED"].includes(p.status)
          )
        )
          fail("اعكس أحدث الفترات أولاً");
        const journals = (await tx.select().from(depreciationJournals))
            .filter(
              (j: any) => j.periodId === row.id && j.kind === "DEPRECIATION"
            )
            .sort((a: any, b: any) => b.id - a.id),
          original = journals[0];
        if (!original) fail("القيد الأصلي غير موجود");
        const snapshot = jsonData(original.snapshot);
        await addJournal(tx, ctx, {
          sourceKey: `reversal:${original.id}`,
          periodId: row.id,
          effectiveDate: original.effectiveDate,
          kind: "REVERSAL",
          snapshot: {
            ...snapshot,
            lines: snapshot.lines.map((l: any) => ({
              ...l,
              debit: l.credit,
              credit: l.debit,
              narration: `عكس ${original.code}: ${input.reason}`,
            })),
            reversedJournalId: original.id,
            reason: input.reason,
          },
        });
        await tx
          .update(depreciationPeriods)
          .set({
            status: "DRAFT",
            version: row.version + 1,
            approvedBy: null,
            approvedAt: null,
            reviewNote: `عكس: ${input.reason}`,
          })
          .where(eq(depreciationPeriods.id, row.id));
        await financialAudit(
          tx,
          ctx,
          "depreciation_periods",
          row.id,
          "DEPRECIATION_REVERSE",
          row,
          { reason: input.reason, originalJournal: original.id }
        );
        return { success: true };
      });
    }),
  report: operatorProcedure
    .input(
      range.safeExtend({
        classificationId: z.number().optional(),
        costCenter: z.string().optional(),
        location: z.string().optional(),
        branch: z.string().optional(),
        department: z.string().optional(),
        entityType: z.enum(["asset", "custody"]).optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => depreciationReport(await database(), input)),
  exportJournals: operatorProcedure
    .input(range)
    .mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        await lockFinance(tx);
        const journals = (await tx.select().from(depreciationJournals)).filter(
          (j: any) =>
            j.effectiveDate >= input.from && j.effectiveDate <= input.to
        );
        if (!journals.length) fail("لا توجد قيود معتمدة في هذه الفترة");
        const periods = await tx.select().from(depreciationPeriods);
        for (const j of journals)
          if (
            !periods.some(
              (p: any) =>
                p.month === j.effectiveDate.slice(0, 7) &&
                ["APPROVED", "CLOSED"].includes(p.status)
            )
          )
            fail(
              "اعتمد دورة الشهر قبل تصدير قيوده؛ لضمان اكتمال الإهلاك مع حركات الاستبعاد والضمان"
            );
        const title = periodTitle("قيود الإهلاك", input.from, input.to),
          file = financialExcel(journals, title),
          contentHash = fingerprint(journals);
        const inserted = await tx.insert(depreciationExports).values({
          fromDate: input.from,
          toDate: input.to,
          snapshot: { title, journals },
          contentHash,
          exportedBy: ctx.user.id,
          exportedAt: new Date(),
        });
        await financialAudit(
          tx,
          ctx,
          "depreciation_exports",
          Number(inserted[0].insertId),
          "DEPRECIATION_EXPORT",
          null,
          { title, journalIds: journals.map((j: any) => j.id), contentHash }
        );
        return {
          base64: file,
          filename: `depreciation-journals-${input.from}-${input.to}.xlsx`,
          exportId: Number(inserted[0].insertId),
        };
      });
    }),
});
