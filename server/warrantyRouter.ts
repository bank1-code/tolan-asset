import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { approvalProcedure, operatorProcedure, router } from "./_core/trpc";
import { canApprove } from "../shared/roles";
import { getDb } from "./db";
import {
  assets,
  custodyItems,
  warrantyReplacements,
  inventoryApprovalNumbers,
  auditLog,
} from "../drizzle/schema";
import { remainingQuantity } from "../shared/inventoryQuantity";
import { isStoredImageUrl } from "../shared/imageUrls";
import { historyAudit, parseHistoryData } from "./history";
import { validateDraftAssignment } from "./inventoryLifecycle";
import { allocateEntityCode } from "./numbering";
import { operationalFinanceLock, protectFinancialHistory } from "./financialOperationalGuard";

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "أدخل تاريخًا صحيحًا")
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "التاريخ غير صحيح");
const serials = z.array(z.string().trim().min(1).max(200)).min(1).max(1000);
export const warrantyPayload = z
  .object({
    entityType: z.enum(["asset", "custody"]),
    entityId: z.number().int().positive(),
    quantity: z.number()
      .int("كمية الاستبدال يجب أن تكون عددًا صحيحًا")
      .positive("كمية الاستبدال يجب أن تكون أكبر من صفر")
      .max(1000, "كمية الاستبدال تتجاوز الحد المسموح 1000 وحدة"),
    provider: z.string().trim().min(1).max(255),
    claimReference: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(4000),
    incidentDate: date,
    effectiveDate: date,
    originalWarrantyStart: date,
    originalWarrantyEnd: date,
    warrantyPolicy: z.enum(["continued", "renewed"]),
    replacementWarrantyStart: date,
    replacementWarrantyEnd: date,
    originalSerialNumbers: serials,
    replacementSerialNumbers: serials,
    replacementName: z.string().trim().min(1).max(500),
    documents: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(255),
          url: z.string().refine(isStoredImageUrl, "رابط المستند غير صالح"),
        })
      )
      .min(1)
      .max(20),
    notes: z.string().max(4000).default(""),
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (input.originalWarrantyEnd < input.originalWarrantyStart)
      issue("originalWarrantyEnd", "نهاية الضمان تسبق بدايته");
    if (
      input.incidentDate < input.originalWarrantyStart ||
      input.incidentDate > input.originalWarrantyEnd
    )
      issue("incidentDate", "تاريخ العطل يجب أن يقع داخل فترة الضمان الأصلي");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
    }).format(new Date());
    if (input.effectiveDate < input.incidentDate || input.effectiveDate > today)
      issue(
        "effectiveDate",
        "تاريخ الاستلام يجب أن يكون بين تاريخ العطل واليوم"
      );
    if (input.replacementWarrantyEnd < input.replacementWarrantyStart)
      issue("replacementWarrantyEnd", "فترة ضمان البديل غير صحيحة");
    if (
      input.warrantyPolicy === "continued" &&
      (input.replacementWarrantyStart !== input.originalWarrantyStart ||
        input.replacementWarrantyEnd !== input.originalWarrantyEnd)
    )
      issue("warrantyPolicy", "استمرار الضمان يحتفظ بتاريخي الضمان الأصليين");
    if (
      input.warrantyPolicy === "renewed" &&
      (input.replacementWarrantyStart < input.effectiveDate ||
        input.replacementWarrantyEnd < input.effectiveDate)
    )
      issue(
        "replacementWarrantyStart",
        "الضمان الجديد يبدأ من استلام البديل أو بعده حسب المستند"
      );
    for (const key of [
      "originalSerialNumbers",
      "replacementSerialNumbers",
    ] as const) {
      if (
        input[key].length !== input.quantity ||
        new Set(input[key]).size !== input.quantity
      )
        issue(key, "أدخل رقمًا تسلسليًا أو معرفًا مميزًا لكل وحدة، دون تكرار");
    }
    if (
      input.replacementSerialNumbers.some(serial =>
        input.originalSerialNumbers.includes(serial)
      )
    )
      issue(
        "replacementSerialNumbers",
        "البديل يجب أن يحمل معرفًا مختلفًا عن العنصر المستبدل"
      );
  });
const reviewed = z.object({
  id: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
});
const tableFor = (kind: "asset" | "custody") =>
  kind === "asset" ? assets : custodyItems;
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
async function source(tx: any, input: z.infer<typeof warrantyPayload>) {
  const table = tableFor(input.entityType);
  const [row] = await tx
    .select()
    .from(table)
    .where(eq(table.id, input.entityId))
    .limit(1)
    .for("update");
  if (
    row &&
    (!Number.isInteger(row.quantity) ||
      row.quantity <= 0 ||
      !Number.isInteger(row.excludedQuantity || 0) ||
      (row.excludedQuantity || 0) < 0 ||
      !Number.isInteger(row.warrantyReplacedQuantity || 0) ||
      (row.warrantyReplacedQuantity || 0) < 0)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "كميات السجل غير صحيحة؛ راجع بياناته",
    });
  if (
    !row ||
    row.status !== "ACTIVE" ||
    !Number.isInteger(remainingQuantity(row)) ||
    remainingQuantity(row) < input.quantity
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "السجل غير نشط أو كمية الاستبدال أكبر من المتبقي الفعلي",
    });
  if (
    (row.warrantyStartDate &&
      row.warrantyStartDate !== input.originalWarrantyStart) ||
    (row.warrantyEndDate && row.warrantyEndDate !== input.originalWarrantyEnd)
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "فترة الضمان المدخلة لا تطابق الضمان المحفوظ للسجل",
    });
  const known = parseHistoryData(row.serialNumbers);
  if (
    Array.isArray(known) &&
    input.originalSerialNumbers.some(serial => !known.includes(serial))
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "معرفات العناصر المستبدلة لا تخص السجل المختار",
    });
  const previous = await tx
    .select()
    .from(warrantyReplacements)
    .where(
      and(
        eq(warrantyReplacements.entityType, input.entityType),
        eq(warrantyReplacements.entityId, input.entityId),
        eq(warrantyReplacements.status, "EXECUTED")
      )
    );
  if (
    previous.some((request: any) =>
      parseHistoryData(request.payload)?.originalSerialNumbers?.some(
        (serial: string) => input.originalSerialNumbers.includes(serial)
      )
    )
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "سبق استبدال أحد هذه العناصر ضمن الضمان",
    });
  return {
    ...row,
    ...(await validateDraftAssignment(tx, row, true)),
    entityName: "assetName" in row ? row.assetName : row.name,
    entityCode: "assetCode" in row ? row.assetCode : row.code,
  };
}
async function lockRequest(
  tx: any,
  input: z.infer<typeof reviewed>,
  statuses: string[]
) {
  const [request] = await tx
    .select()
    .from(warrantyReplacements)
    .where(eq(warrantyReplacements.id, input.id))
    .limit(1)
    .for("update");
  if (!request) throw new TRPCError({ code: "NOT_FOUND" });
  if (
    !statuses.includes(request.status) ||
    request.version !== input.expectedVersion
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "تغير الطلب أو أصبح مقفلًا؛ حدّث القائمة",
    });
  return request;
}
async function audit(
  tx: any,
  ctx: any,
  request: any,
  action: string,
  oldData: any,
  newData: any
) {
  await historyAudit(tx, ctx, {
    entityType: request.entityType,
    entityId: request.entityId,
    tableName: "warranty_replacements",
    recordId: request.id,
    actionType: action,
    actionDescription: `${action === "WARRANTY" ? "تنفيذ استبدال الضمان" : "طلب استبدال ضمان"} #${request.id}`,
    oldData,
    newData: {
      ...parseHistoryData(newData.payload),
      ...newData,
      warrantyRequestId: request.id,
      entityName: parseHistoryData(request.sourceSnapshot)?.entityName,
    },
  });
}

export const warrantyRouter = router({
  list: operatorProcedure.query(async () =>
    (await database())
      .select()
      .from(warrantyReplacements)
      .orderBy(desc(warrantyReplacements.createdAt))
  ),
  getById: operatorProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await database();
      const [request] = await db
        .select()
        .from(warrantyReplacements)
        .where(eq(warrantyReplacements.id, input.id))
        .limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND" });
      const audit = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tableName, "warranty_replacements"),
            eq(auditLog.recordId, input.id)
          )
        )
        .orderBy(desc(auditLog.createdAt));
      return { ...request, audit };
    }),
  saveDraft: operatorProcedure
    .input(
      z.object({
        request: warrantyPayload,
        id: z.number().int().positive().optional(),
        expectedVersion: z.number().int().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      (await database()).transaction(async tx => {
        const old = input.id
          ? await lockRequest(
              tx,
              { id: input.id, expectedVersion: input.expectedVersion ?? -1 },
              ["DRAFT"]
            )
          : null;
        if (
          old &&
          old.createdBy !== ctx.user.id &&
          !canApprove(ctx.user.role)
        )
          throw new TRPCError({ code: "FORBIDDEN" });
        if (
          old &&
          (old.entityType !== input.request.entityType ||
            old.entityId !== input.request.entityId)
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "لا يمكن تغيير السجل المرتبط بالطلب؛ أنشئ طلبًا آخر",
          });
        const snapshot = await source(tx, input.request);
        const data = {
          entityType: input.request.entityType,
          entityId: input.request.entityId,
          payload: input.request,
          sourceSnapshot: snapshot,
          status: "DRAFT",
          version: (old?.version ?? -1) + 1,
        };
        let id = input.id;
        if (id)
          await tx
            .update(warrantyReplacements)
            .set(data)
            .where(eq(warrantyReplacements.id, id));
        else {
          const result = await tx
            .insert(warrantyReplacements)
            .values({
              ...data,
              createdBy: ctx.user.id,
              createdByName: ctx.user.name,
            });
          id = Number(result[0].insertId);
        }
        await audit(
          tx,
          ctx,
          { ...data, id },
          old ? "WARRANTY_EDIT" : "WARRANTY_REQUEST",
          old,
          data
        );
        return { id: id!, version: data.version };
      })
    ),
  submit: operatorProcedure.input(reviewed).mutation(async ({ input, ctx }) =>
    (await database()).transaction(async tx => {
      const old = await lockRequest(tx, input, ["DRAFT"]);
      if (
        old.createdBy !== ctx.user.id &&
        !canApprove(ctx.user.role)
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const payload = warrantyPayload.parse(parseHistoryData(old.payload));
      const snapshot = await source(tx, payload);
      const data = {
        status: "SUBMITTED",
        sourceSnapshot: snapshot,
        version: old.version + 1,
      };
      await tx
        .update(warrantyReplacements)
        .set(data)
        .where(eq(warrantyReplacements.id, old.id));
      await audit(
        tx,
        ctx,
        { ...old, sourceSnapshot: snapshot },
        "WARRANTY_SUBMIT",
        old,
        { ...old, ...data }
      );
      return { success: true };
    })
  ),
  returnForCorrection: approvalProcedure
    .input(reviewed.extend({ note: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) =>
      (await database()).transaction(async tx => {
        const old = await lockRequest(tx, input, ["SUBMITTED"]);
        const data = { status: "DRAFT", version: old.version + 1 };
        await tx
          .update(warrantyReplacements)
          .set(data)
          .where(eq(warrantyReplacements.id, old.id));
        await audit(tx, ctx, old, "WARRANTY_REVIEW", old, {
          ...old,
          ...data,
          reviewNote: input.note,
        });
        return { success: true };
      })
    ),
  cancel: operatorProcedure.input(reviewed).mutation(async ({ input, ctx }) =>
    (await database()).transaction(async tx => {
      const old = await lockRequest(tx, input, ["DRAFT", "SUBMITTED"]);
      if (
        old.createdBy !== ctx.user.id &&
        !canApprove(ctx.user.role)
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      const data = { status: "CANCELLED", version: old.version + 1 };
      await tx
        .update(warrantyReplacements)
        .set(data)
        .where(eq(warrantyReplacements.id, old.id));
      await audit(tx, ctx, old, "WARRANTY_CANCEL", old, { ...old, ...data });
      return { success: true };
    })
  ),
  execute: approvalProcedure.input(reviewed).mutation(async ({ input, ctx }) =>
    (await database()).transaction(async tx => {
      await operationalFinanceLock(tx);
      const request = await lockRequest(tx, input, ["SUBMITTED"]);
      const payload = warrantyPayload.parse(parseHistoryData(request.payload));
      await protectFinancialHistory(tx,payload.entityType,payload.entityId,payload.effectiveDate);
      const old = await source(tx, payload);
      const reviewedSource = parseHistoryData(request.sourceSnapshot);
      if (
        [
          "assignedTo",
          "departmentId",
          "locationId",
          "assetValue",
          "classificationId",
          "quantity",
          "entityName",
          "entityCode",
        ].some(key => old[key] !== reviewedSource[key])
      )
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "تغيرت بيانات السجل بعد تقديم الطلب؛ أعده للمراجعة قبل التنفيذ",
        });
      const table = tableFor(payload.entityType),
        nameKey = payload.entityType === "asset" ? "assetName" : "name",
        codeKey = payload.entityType === "asset" ? "assetCode" : "code";
      const numbering = await allocateEntityCode(
        tx,
        old.locationId,
        payload.entityType
      );
      const now = new Date();
      const operationCode = `WRP-${String(request.id).padStart(8, "0")}`;
      const replacement = {
        [nameKey]: payload.replacementName,
        [codeKey]: numbering.code,
        quantity: payload.quantity,
        assetValue: old.assetValue,
        classificationId: old.classificationId ?? null,
        status: "ACTIVE",
        condition: "جيد جدًا",
        assignedTo: old.assignedTo,
        departmentId: old.departmentId,
        locationId: old.locationId,
        originLocationId: old.locationId,
        approvedBy: ctx.user.id,
        approvedAt: now,
        serialNumbers: payload.replacementSerialNumbers,
        warrantyStartDate: payload.replacementWarrantyStart,
        warrantyEndDate: payload.replacementWarrantyEnd,
        notes: `بديل ضمان ${operationCode} للسجل ${old.entityCode}\n${payload.notes}`,
        excludedQuantity: 0,
        warrantyReplacedQuantity: 0,
      };
      const result = await tx.insert(table).values(replacement as any);
      const replacementEntityId = Number(result[0].insertId);
      const after = {
        ...old,
        warrantyReplacedQuantity:
          (old.warrantyReplacedQuantity || 0) + payload.quantity,
        status:
          remainingQuantity(old) === payload.quantity ? "REPLACED" : "ACTIVE",
      };
      const execution = {
        ...payload,
        operationCode,
        sourceEntityId: old.id,
        sourceEntityCode: old.entityCode,
        sourceEntityName: old.entityName,
        replacementEntityId,
        replacementCode: numbering.code,
        originalUnitValue: old.assetValue,
        quantityBefore: remainingQuantity(old),
        quantityRemaining: remainingQuantity(after),
        warrantyReplacedQuantity: after.warrantyReplacedQuantity,
        status: after.status,
        employeeName: old.employeeName,
        departmentName: old.departmentName,
        locationName: old.locationName,
        executedByName: ctx.user.name,
        executedAt: now.toISOString(),
      };
      await tx
        .update(table)
        .set({
          warrantyReplacedQuantity: after.warrantyReplacedQuantity,
          status: after.status,
        })
        .where(eq(table.id, old.id));
      await tx
        .insert(inventoryApprovalNumbers)
        .values({
          entityType: payload.entityType,
          entityId: replacementEntityId,
          code: numbering.code,
          approvedBy: ctx.user.id,
        });
      const approvedSnapshot = {
        ...replacement,
        entityName: payload.replacementName,
        entityCode: numbering.code,
        employeeName: old.employeeName,
        departmentName: old.departmentName,
        locationName: old.locationName,
        warrantyRequestId: request.id,
        sourceEntityId: old.id,
        sourceEntityCode: old.entityCode,
        operationCode,
        approvedByName: ctx.user.name,
      };
      await tx
        .update(table)
        .set({ approvalSnapshot: approvedSnapshot })
        .where(eq(table.id, replacementEntityId));
      await tx
        .update(warrantyReplacements)
        .set({
          status: "EXECUTED",
          operationCode,
          replacementEntityId,
          executionSnapshot: execution,
          executedBy: ctx.user.id,
          executedAt: now,
          version: request.version + 1,
        })
        .where(eq(warrantyReplacements.id, request.id));
      await audit(tx, ctx, request, "WARRANTY", old, execution);
      await historyAudit(tx, ctx, {
        entityType: payload.entityType,
        entityId: replacementEntityId,
        tableName: payload.entityType === "asset" ? "assets" : "custody_items",
        recordId: replacementEntityId,
        actionType: "CREATE",
        actionDescription: `إنشاء بديل ضمان معتمد ${operationCode}`,
        newData: approvedSnapshot,
      });
      return {
        success: true,
        operationCode,
        replacementEntityId,
        replacementCode: numbering.code,
      };
    })
  ),
});
