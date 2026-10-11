import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  auditLog,
  assets,
  custodyItems,
  financialClassifications,
  depreciationControl,
  depreciationPolicies,
  depreciationBatches,
  depreciationMovements,
  depreciationPeriods,
  assetExclusions,
  assetTransfers,
  warrantyReplacements,
} from "../drizzle/schema";
import { parseHistoryData, archiveEvents } from "./history";
import {
  policyPayload,
  batchPayload,
  movementPayload,
  type FinancialBatch,
  type FinancialMovement,
  money, amount,
} from "../shared/depreciation";

export const jsonData = <T = any>(value: unknown): T => parseHistoryData(value);
export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function fail(
  message: string,
  code: "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" = "BAD_REQUEST"
): never {
  throw new TRPCError({ code, message });
}
export async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "قاعدة البيانات غير متاحة",
    });
  return db;
}
export async function lockFinance(tx: any) {
  // Singleton exists in the migration. All financial writers take this lock first.
  const [row] = await tx
    .select()
    .from(depreciationControl)
    .where(eq(depreciationControl.id, 1))
    .for("update");
  if (!row) fail("طبق ترحيل وحدة الإهلاك أولاً");
  return row;
}
export async function bumpFinance(tx: any) {
  const [row] = await tx
    .select()
    .from(depreciationControl)
    .where(eq(depreciationControl.id, 1));
  await tx
    .update(depreciationControl)
    .set({ revision: row.revision + 1 })
    .where(eq(depreciationControl.id, 1));
}
export async function financialAudit(
  tx: any,
  ctx: any,
  tableName: string,
  recordId: number,
  actionType: string,
  oldData: unknown,
  newData: unknown
) {
  const inserted = await tx
    .insert(auditLog)
    .values({
      tableName,
      recordId,
      actionType,
      actionDescription: `وحدة الإهلاك: ${actionType}`,
      oldData,
      newData,
      performedBy: ctx.user.id,
      performedByName: ctx.user.name,
      ipAddress: ctx.req?.ip ?? null,
      userAgent: ctx.req?.headers?.["user-agent"] ?? null,
    });
  const current:any=newData??oldData??{},targets=new Map<string,{entityType:"asset"|"custody";entityId:number}>();
  const include=(r:any)=>{if(["asset","custody"].includes(r?.entityType)&&r.entityId)targets.set(`${r.entityType}:${r.entityId}`,{entityType:r.entityType,entityId:r.entityId});};
  include(current);include(oldData);
  if(current.batchId){const [batch]=await tx.select().from(depreciationBatches).where(eq(depreciationBatches.id,current.batchId));include(batch);}
  for(const line of current.snapshot?.lines??[])include(line);
  if(actionType.startsWith("DEPRECIATION_")&&tableName==="depreciation_periods"&&actionType!=="DEPRECIATION_DRAFT")for(const line of jsonData((oldData as any)?.snapshot)?.lines??[])include(line);
  const scoped = (value: any, target: {entityType: "asset" | "custody"; entityId: number}) => {
    if (!value || tableName !== "depreciation_periods") return value;
    const snapshot = jsonData(value.snapshot);
    if (!snapshot || !Array.isArray(snapshot.lines)) return value;
    const belongs = (line: any) => line.entityType === target.entityType && line.entityId === target.entityId;
    const lines = snapshot.lines.filter(belongs);
    return {...value, entityType: target.entityType, entityId: target.entityId,
      entityName: lines[0]?.name,
      archiveScope: {tableName, recordId, fullAuditId: Number(inserted[0].insertId), periodTotal: snapshot.total},
      snapshot: {...snapshot, lines, total: amount(lines.reduce((n: bigint, line: any) => n + money(line.debit), 0n)),
        exceptions: (snapshot.exceptions ?? []).filter(belongs)}};
  };
  await archiveEvents(tx,ctx,[...targets.values()].map(target=>({...target,eventType:actionType,
    sourceKey:`finance:${Number(inserted[0].insertId)}:${target.entityType}:${target.entityId}`,
    oldData:scoped(oldData,target),newData:scoped(current,target)})));
}
export async function lockDocument(
  tx: any,
  table: any,
  id: number,
  version: number
) {
  const [row] = await tx
    .select()
    .from(table)
    .where(eq(table.id, id))
    .for("update");
  if (!row) fail("السجل غير موجود");
  if (row.version !== version)
    fail("تغير السجل؛ حدّث الشاشة قبل المتابعة", "CONFLICT");
  return row;
}
export function requireDraft(row: any) {
  if (row.status !== "DRAFT")
    fail("السجل معتمد ومقفل؛ استخدم إجراءً مستقلاً للتصحيح", "FORBIDDEN");
}
export function separateApprover(row: any, ctx: any) {
  if (row.createdBy === ctx.user.id || row.updatedBy === ctx.user.id)
    fail(
      "لا يمكن للمعد أو آخر معدل اعتماد عمله؛ يحتاج مراجعة مستخدم آخر مخول",
      "FORBIDDEN"
    );
}
export async function sourceRecord(
  tx: any,
  type: string,
  id: number,
  lock = false
) {
  const table = type === "asset" ? assets : custodyItems;
  const query = tx.select().from(table).where(eq(table.id, id));
  const [row] = await (lock ? query.for("update") : query);
  if (!row || ["DRAFT", "CANCELLED"].includes(row.status))
    fail("السجل التشغيلي غير معتمد أو غير موجود");
  return {
    ...row,
    name: row.assetName ?? row.name,
    code: row.assetCode ?? row.code ?? `#${row.id}`,
  };
}
export async function assertFutureDate(tx: any, date: string) {
  const periods = await tx.select().from(depreciationPeriods);
  const latest = periods
      .filter((p: any) => ["APPROVED", "CLOSED"].includes(p.status))
      .map((p: any) => p.month)
      .sort()
      .at(-1);
    if (latest && date.slice(0, 7) <= latest)
      fail(
        "التاريخ داخل فترة محتسبة؛ اعكس الفترات المفتوحة المتأثرة أولاً. الفترات المقفلة لا تعدل."
      );
}
export async function financialState(tx: any, lock = false) {
  const read = (table: any) => {
    const query = tx.select().from(table).orderBy(table.id);
    return lock ? query.for("update") : query;
  };
  const policies = await tx.select().from(depreciationPolicies);
  const classes = await tx.select().from(financialClassifications);
  const rows = await tx.select().from(depreciationBatches);
  const movementRows = await tx.select().from(depreciationMovements);
  const assetRows = await read(assets);
  const custodyRows = await read(custodyItems);
  const exclusions = await read(assetExclusions);
  const transfers = await read(assetTransfers);
  const warranties = await read(warrantyReplacements);
  const batches: FinancialBatch[] = rows
    .filter((r: any) => r.status === "APPROVED")
    .map((row: any) => {
      const policy = policies.find(
        (p: any) => p.id === row.policyId && p.status === "APPROVED"
      );
      if (!policy) fail("دفعة مالية مرتبطة بتهيئة غير معتمدة");
      const p = policyPayload.parse(jsonData(policy.payload));
      const classification = classes.find(
        (c: any) => c.id === row.classificationId
      );
      const source = (
        row.entityType === "asset" ? assetRows : custodyRows
      ).find((r: any) => r.id === row.entityId);
      const rule = p.rules.find(
        r => r.classificationId === row.classificationId
      );
      if (!classification || !source || !rule) fail("رابط مالي ناقص");
      return {
        ...row,
        payload: batchPayload.parse(jsonData(row.payload)),
        rule,
        partialMonth: p.partialMonth,
        identity: {
          name: source.assetName ?? source.name,
          code: source.assetCode ?? source.code ?? `#${source.id}`,
          classification: classification.name,
          classificationCode: classification.code,
        },
      };
    });
  const movements: FinancialMovement[] = movementRows
    .filter((m: any) => m.status === "APPROVED")
    .map((m: any) => ({
      ...m,
      payload: movementPayload.parse(jsonData(m.payload)),
    }));
  return {
    policies,
    classes,
    rows,
    movementRows,
    assetRows,
    custodyRows,
    exclusions,
    transfers,
    warranties,
    batches,
    movements,
  };
}

export function operationalSources(
  state: Pick<Awaited<ReturnType<typeof financialState>>, "exclusions" | "transfers" | "warranties">
) {
  return [
    ...state.exclusions.map((s: any) => ({
      sourceKey: `exclusion:${s.id}`,
      entityType: s.entityType,
      entityId: s.entityId,
      kind: "DISPOSAL",
      effectiveDate:
        s.effectiveDate || new Date(s.exclusionDate).toISOString().slice(0, 10),
      quantity: s.quantityExcluded,
      description: s.reason,
      replacementEntityId: null,
    })),
    ...state.transfers.map((s: any) => ({
      sourceKey: `transfer:${s.id}`,
      entityType: s.entityType,
      entityId: s.entityId,
      kind: "TRANSFER",
      effectiveDate: new Date(s.transferredAt).toISOString().slice(0, 10),
      quantity: s.quantity,
      description: `${s.toLocation ?? ""} / ${s.toDepartment ?? ""}`,
      replacementEntityId: null,
    })),
    ...state.warranties
      .filter((s: any) => s.status === "EXECUTED")
      .map((s: any) => {
        const p = jsonData(s.payload);
        return {
          sourceKey: `warranty:${s.id}`,
          entityType: s.entityType,
          entityId: s.entityId,
          kind: "WARRANTY",
          effectiveDate: p.effectiveDate,
          quantity: p.quantity,
          description: p.reason,
          replacementEntityId: s.replacementEntityId,
        };
      }),
  ];
}
