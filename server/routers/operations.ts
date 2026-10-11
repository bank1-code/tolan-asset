import { remainingQuantity } from "../../shared/inventoryQuantity";
/**
 * Operations Router - النقل والاستبعاد وبراءة الذمة
 */
import { z } from "zod";
import { eq, and, asc, desc, sql, inArray } from "drizzle-orm";
import { operatorProcedure, deleteProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  assets,
  custodyItems,
  employees,
  departments,
  branches,
  locations,
  assetTransfers,
  assetExclusions,
  exclusionTypes,
  clearanceRecords,
  exclusionSequence,
  exclusionDrafts,
  exclusionAttachments,
  auditLog,
} from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { TRPCError } from "@trpc/server";
import { isStoredImageUrl } from "../../shared/imageUrls";
import { historyAudit } from "../history";
import { operationalFinanceLock, protectFinancialHistory } from "../financialOperationalGuard";


async function resolveTransferDestination(db: any, employeeId: number, locationId: number, departmentId: number) {
  const [employee] = await db.select({ id: employees.id }).from(employees)
    .where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المستلم غير موجود" });

  const [department] = await db.select({
    id: departments.id,
    name: departments.name,
    branchId: departments.branchId,
    branchName: branches.name,
    locationId: branches.locationId,
    locationRecordId: locations.id,
    locationName: locations.name,
  }).from(departments)
    .leftJoin(branches, eq(departments.branchId, branches.id))
    .leftJoin(locations, eq(branches.locationId, locations.id))
    .where(eq(departments.id, departmentId)).limit(1);
  if (!department) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم الجديد غير موجود" });
  if (department.locationId !== locationId || department.locationRecordId !== locationId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "القسم الجديد لا يتبع الموقع الجديد المختار" });
  }
  return {
    employeeId,
    departmentId,
    departmentName: department.name,
    locationId,
    locationName: department.locationName || "",
  };
}

// =============================================
// النقل
// =============================================
const transferSnapshotSchema = z.object({
  entityName: z.string(), entityCode: z.string().nullable(),
  fromEmployeeName: z.string(), toEmployeeName: z.string(),
});
function transferSnapshot(data: unknown) {
  const result = transferSnapshotSchema.safeParse((data as { transferSnapshot?: unknown } | null)?.transferSnapshot);
  return result.success ? result.data : null;
}

const transferInput = z.object({
  entityType: z.enum(["asset", "custody"]),
  entityId: z.number().int().nonnegative().optional(),
  movementType: z.enum(["total", "partial"]),
  fromEmployeeId: z.number().int().positive().nullable(),
  toEmployeeId: z.number().int().positive(),
  toDepartmentId: z.number().int().positive(),
  toLocationId: z.number().int().positive(),
  notes: z.string().max(5000).optional().nullable(),
  // The existing individual workflow transfers the selected record's entire
  // remaining quantity; it does not split records or process an item basket.
  items: z.array(z.unknown()).max(0, "استخدم نقل السجل المحدد؛ سلة النقل غير مدعومة").optional(),
}).superRefine((input, ctx) => {
  if (input.movementType === "partial" && !input.entityId) ctx.addIssue({ code: "custom", path: ["entityId"], message: "حدد الأصل أو العهدة" });
  if (input.movementType === "total" && !input.fromEmployeeId) ctx.addIssue({ code: "custom", path: ["fromEmployeeId"], message: "حدد الموظف المصدر للنقل الكلي" });
});

const transfersRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select({ transfer: assetTransfers, auditData: auditLog.newData }).from(assetTransfers)
      .leftJoin(auditLog, and(eq(auditLog.tableName, "asset_transfers"), eq(auditLog.recordId, assetTransfers.id), eq(auditLog.actionType, "TRANSFER")))
      .orderBy(desc(assetTransfers.createdAt));
    return rows.map(({ transfer, auditData }) => ({ ...transfer, ...transferSnapshot(auditData), historicalSnapshot: Boolean(transferSnapshot(auditData)) }));
  }),
  getById: operatorProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [transfer] = await db.select().from(assetTransfers).where(eq(assetTransfers.id, input.id)).limit(1);
    if (!transfer) throw new TRPCError({ code: "NOT_FOUND" });
    const [log] = await db.select({ data: auditLog.newData }).from(auditLog)
      .where(and(eq(auditLog.tableName, "asset_transfers"), eq(auditLog.recordId, transfer.id), eq(auditLog.actionType, "TRANSFER"))).limit(1);
    const snapshot = transferSnapshot(log?.data);
    if (snapshot) return { ...transfer, ...snapshot, historicalSnapshot: true };
    // Older records have no saved name snapshot. Keep them readable, clearly
    // distinguishing current lookup values from historical evidence.
    const table = transfer.entityType === "asset" ? assets : custodyItems;
    const [entity] = await db.select().from(table).where(eq(table.id, transfer.entityId)).limit(1);
    const [source] = transfer.fromEmployeeId ? await db.select().from(employees).where(eq(employees.id, transfer.fromEmployeeId)).limit(1) : [];
    const [target] = transfer.toEmployeeId ? await db.select().from(employees).where(eq(employees.id, transfer.toEmployeeId)).limit(1) : [];
    return { ...transfer, entityName: entity ? (transfer.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetName : (entity as typeof custodyItems.$inferSelect).name) : "",
      entityCode: entity ? (transfer.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetCode : (entity as typeof custodyItems.$inferSelect).code) : null,
      fromEmployeeName: source?.fullName || "غير محدد", toEmployeeName: target?.fullName || "غير محدد", historicalSnapshot: false };
  }),
  // Reject older clients explicitly as well as removing editing from the UI.
  update: operatorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(() => {
    throw new TRPCError({ code: "FORBIDDEN", message: "حركة النقل منفذة وتاريخية؛ لا يمكن تعديلها مباشرة" });
  }),
  create: operatorProcedure.input(transferInput).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.transaction(async tx => {
      await operationalFinanceLock(tx);
      const destination = await resolveTransferDestination(tx, input.toEmployeeId, input.toLocationId, input.toDepartmentId);
      const [targetEmployee] = await tx.select().from(employees).where(eq(employees.id, destination.employeeId)).limit(1);
      if (!targetEmployee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المستلم غير موجود" });
      const table = input.entityType === "asset" ? assets : custodyItems;
      let selected;
      if (input.movementType === "total") {
        const [sourceEmployee] = await tx.select().from(employees).where(eq(employees.id, input.fromEmployeeId!)).limit(1);
        if (!sourceEmployee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المصدر غير موجود" });
        selected = await tx.select().from(table).where(and(eq(table.assignedTo, input.fromEmployeeId!), eq(table.status, "ACTIVE"), sql`${table.quantity} - COALESCE(${table.excludedQuantity}, 0) - ${table.warrantyReplacedQuantity} > 0`))
          .orderBy(asc(table.id)).for("update");
      } else {
        selected = await tx.select().from(table).where(eq(table.id, input.entityId!)).limit(1).for("update");
        if (!selected.length) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل أو العهدة غير موجودة" });
        const current = selected[0];
        if (input.fromEmployeeId !== undefined && (current.assignedTo || null) !== input.fromEmployeeId) {
          throw new TRPCError({ code: "CONFLICT", message: "تغير الموظف المسؤول عن السجل؛ حدّث البيانات قبل النقل" });
        }
      }
      // Do not create a historical event for an unchanged assignment.
      const affected = selected.filter(entity => entity.assignedTo !== destination.employeeId || entity.departmentId !== destination.departmentId || entity.locationId !== destination.locationId);
      if (!affected.length) throw new TRPCError({ code: "BAD_REQUEST", message: "لا توجد عناصر قابلة للنقل إلى وجهة مختلفة" });
      const affectedEntityIds = affected.map(entity => entity.id);
      const transferIds: number[] = [];
      let quantityMoved = 0;
      for (const entity of affected) {
        await protectFinancialHistory(tx,input.entityType,entity.id,new Date().toISOString().slice(0,10));
        const excluded = entity.excludedQuantity || 0;
        const remaining = remainingQuantity(entity);
        if (entity.status !== "ACTIVE" || !Number.isInteger(remaining) || remaining <= 0 || excluded < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن نقل سجل مستبعد أو غير نشط أو بدون كمية متبقية" });
        }
        const [sourceEmployee] = entity.assignedTo ? await tx.select().from(employees).where(eq(employees.id, entity.assignedTo)).limit(1) : [];
        const [sourceDepartment] = entity.departmentId ? await tx.select().from(departments).where(eq(departments.id, entity.departmentId)).limit(1) : [];
        const [sourceLocation] = entity.locationId ? await tx.select().from(locations).where(eq(locations.id, entity.locationId)).limit(1) : [];
        const snapshot = {
          entityName: input.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetName : (entity as typeof custodyItems.$inferSelect).name,
          entityCode: input.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetCode : (entity as typeof custodyItems.$inferSelect).code,
          fromEmployeeName: sourceEmployee?.fullName || "غير محدد", toEmployeeName: targetEmployee.fullName,
        };
        const record = {
          entityType: input.entityType, entityId: entity.id, movementType: input.movementType,
          fromEmployeeId: entity.assignedTo, toEmployeeId: destination.employeeId,
          fromDepartment: sourceDepartment?.name || null, toDepartment: destination.departmentName,
          fromLocation: sourceLocation?.name || null, toLocation: destination.locationName,
          quantity: remaining, assetValue: entity.assetValue, notes: input.notes || null, transferredBy: ctx.user.id,
        };
        const inserted = await tx.insert(assetTransfers).values(record);
        const id = Number(inserted[0].insertId);
        await tx.update(table).set({ assignedTo: destination.employeeId, departmentId: destination.departmentId, locationId: destination.locationId }).where(eq(table.id, entity.id));
        await historyAudit(tx, ctx, { entityType: input.entityType, entityId: entity.id, transferId: id, tableName: "asset_transfers", recordId: id, actionType: "TRANSFER",
          actionDescription: "نقل " + (input.entityType === "asset" ? "أصل" : "عهدة") + " #" + entity.id,
          oldData: entity, newData: { ...record, destination, affectedEntityIds, transferSnapshot: snapshot },
          changedFields: [
            ...(entity.assignedTo !== destination.employeeId ? ["assignedTo"] : []),
            ...(entity.departmentId !== destination.departmentId ? ["departmentId"] : []),
            ...(entity.locationId !== destination.locationId ? ["locationId"] : []),
          ],
        });
        transferIds.push(id); quantityMoved += remaining;
      }
      return { success: true, id: transferIds[0], transferIds, affectedEntityIds, count: transferIds.length, quantityMoved };
    });
  }),
});

// =============================================
// الاستبعاد
// =============================================
const exclusionInput = z.object({
  entityType: z.enum(["asset", "custody"]),
  entityId: z.number().int().positive(),
  exclusionMode: z.enum(["full", "partial"]).default("partial"),
  exclusionTypeId: z.number().int().positive(),
  reason: z.string().trim().min(5),
  quantityExcluded: z.number().int().positive(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(value + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "تاريخ سريان غير صحيح"),
  responsibleData: z.array(z.object({ job: z.string().trim().min(2), name: z.string().trim().min(3) })).min(1).max(6),
  exclusionImages: z.array(z.string().refine(isStoredImageUrl, "رابط صورة غير صالح؛ أعد رفع الصورة من التطبيق")).max(6).default([]),
  draftId: z.number().int().positive().optional(),
});

const exclusionsRouter = router({
  getById: operatorProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [record] = await db.select().from(assetExclusions).where(eq(assetExclusions.id, input.id)).limit(1);
    if (!record) throw new TRPCError({ code: "NOT_FOUND" });
    const attachments = await db.select().from(exclusionAttachments).where(eq(exclusionAttachments.exclusionId, input.id)).orderBy(asc(exclusionAttachments.createdAt), asc(exclusionAttachments.id));
    const audit = await db.select().from(auditLog).where(and(eq(auditLog.tableName, "asset_exclusions"), eq(auditLog.recordId, input.id))).orderBy(asc(auditLog.createdAt));
    const attachmentAudit = attachments.length ? await db.select().from(auditLog).where(and(eq(auditLog.tableName, "exclusion_attachments"), inArray(auditLog.recordId, attachments.map(item => item.id)))) : [];
    return { record, attachments, audit: [...audit, ...attachmentAudit].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) };
  }),
  addAttachment: operatorProcedure.input(z.object({ exclusionId: z.number().int().positive(), fileName: z.string().trim().min(1).max(255),
    url: z.string().refine(isStoredImageUrl, "رابط المرفق غير صالح"), contentType: z.enum(["image/webp", "application/pdf"]) })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.transaction(async tx => {
      const [record] = await tx.select().from(assetExclusions).where(eq(assetExclusions.id, input.exclusionId)).limit(1).for("update");
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await tx.select().from(exclusionAttachments).where(eq(exclusionAttachments.exclusionId, record.id));
      if (existing.some(item => item.url === input.url)) throw new TRPCError({ code: "CONFLICT", message: "المرفق مرتبط بالعملية بالفعل" });
      const data = { ...input, createdBy: ctx.user.id, createdByName: ctx.user.name };
      const inserted = await tx.insert(exclusionAttachments).values(data);
      const id = Number(inserted[0].insertId);
      await historyAudit(tx, ctx, { entityType: record.entityType as "asset" | "custody", entityId: record.entityId, exclusionId: record.id,
        tableName: "exclusion_attachments", recordId: id, actionType: "ATTACH", actionDescription: `إضافة مرفق للاستبعاد ${record.exclusionCode}`,
        newData: { ...data, entityType: record.entityType, entityId: record.entityId, entityName: record.entityName, exclusionCode: record.exclusionCode } });
      return { id };
    });
  }),
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(assetExclusions).orderBy(desc(assetExclusions.createdAt));
  }),
  drafts: operatorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(exclusionDrafts).where(eq(exclusionDrafts.createdBy, ctx.user.id)).orderBy(desc(exclusionDrafts.updatedAt));
  }),
  saveDraft: operatorProcedure.input(exclusionInput).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.transaction(async tx => {
      if (input.draftId) {
        const [draft] = await tx.select().from(exclusionDrafts).where(and(eq(exclusionDrafts.id, input.draftId), eq(exclusionDrafts.createdBy, ctx.user.id))).for("update");
        if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "المسودة غير موجودة أو سبق تنفيذها" });
        await tx.update(exclusionDrafts).set({ payload: input }).where(eq(exclusionDrafts.id, draft.id));
        return { id: draft.id };
      }
      const result = await tx.insert(exclusionDrafts).values({ createdBy: ctx.user.id, payload: input });
      return { id: Number(result[0].insertId) };
    });
  }),
  deleteDraft: operatorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(exclusionDrafts).where(and(eq(exclusionDrafts.id, input.id), eq(exclusionDrafts.createdBy, ctx.user.id)));
    return { success: true };
  }),
  create: operatorProcedure.input(exclusionInput).mutation(async ({ input, ctx }) => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    if (input.effectiveDate > today) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تنفيذ استبعاد بتاريخ سريان مستقبلي؛ احفظه كمسودة حتى تاريخ السريان" });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.transaction(async tx => {
      await operationalFinanceLock(tx);
      await protectFinancialHistory(tx,input.entityType,input.entityId,input.effectiveDate);
      if (!input.draftId) throw new TRPCError({ code: "BAD_REQUEST", message: "احفظ المسودة قبل التنفيذ" });
      const [draft] = await tx.select().from(exclusionDrafts).where(and(eq(exclusionDrafts.id, input.draftId), eq(exclusionDrafts.createdBy, ctx.user.id))).for("update");
      if (!draft) throw new TRPCError({ code: "CONFLICT", message: "المسودة غير موجودة أو سبق تنفيذها" });
      const saved = exclusionInput.parse(draft.payload);
      if (JSON.stringify({ ...saved, draftId: input.draftId }) !== JSON.stringify(input)) {
        throw new TRPCError({ code: "CONFLICT", message: "تغيرت المسودة؛ احفظ التعديلات قبل التنفيذ" });
      }
      const table = input.entityType === "asset" ? assets : custodyItems;
      const [entity] = await tx.select().from(table).where(eq(table.id, input.entityId)).limit(1).for("update");
      if (!entity) throw new TRPCError({ code: "NOT_FOUND" });
      const before = remainingQuantity(entity);
      if (!Number.isInteger(entity.quantity) || entity.quantity <= 0 || !Number.isInteger(entity.excludedQuantity || 0) || (entity.excludedQuantity || 0) < 0 || before < 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "كميات السجل غير صالحة؛ راجع بياناته قبل الاستبعاد" });
      if (entity.status !== "ACTIVE" || before <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "الاستبعاد متاح للسجلات النشطة ذات الكمية المتبقية فقط" });
      const qty = input.quantityExcluded;
      if (qty > before) throw new TRPCError({ code: "BAD_REQUEST", message: "الكمية المطلوبة تتجاوز المتبقي الفعلي (" + before + ")" });
      const [type] = await tx.select().from(exclusionTypes).where(eq(exclusionTypes.id, input.exclusionTypeId));
      if (!type) throw new TRPCError({ code: "BAD_REQUEST", message: "نوع الاستبعاد غير موجود" });
      const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Riyadh", year: "numeric" }).format(new Date()));
      await tx.insert(exclusionSequence).values({ year, seq: 1 }).onDuplicateKeyUpdate({ set: { seq: sql`seq + 1` } });
      const [sequence] = await tx.select().from(exclusionSequence).where(eq(exclusionSequence.year, year)).for("update");
      const code = "EXC-" + year + "-" + String(sequence.seq).padStart(4, "0");
      const remaining = before - qty;
      const name = input.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetName : (entity as typeof custodyItems.$inferSelect).name;
      const entityCode = input.entityType === "asset" ? (entity as typeof assets.$inferSelect).assetCode : (entity as typeof custodyItems.$inferSelect).code;
      const [employee] = entity.assignedTo ? await tx.select().from(employees).where(eq(employees.id, entity.assignedTo)) : [];
      const [department] = entity.departmentId ? await tx.select().from(departments).where(eq(departments.id, entity.departmentId)) : [];
      const [location] = entity.locationId ? await tx.select().from(locations).where(eq(locations.id, entity.locationId)) : [];
      const record = {
        entityType: input.entityType, entityId: entity.id, entityName: name, entityCode,
        exclusionCode: code, exclusionMode: remaining === 0 ? "full" : "partial", exclusionTypeId: input.exclusionTypeId,
        originalUnitValue: entity.assetValue, entitySnapshot: { ...entity, entityName: name, entityCode, exclusionTypeName: type.name,
          employeeName: employee?.fullName ?? null, departmentName: department?.name ?? null, locationName: location?.name ?? null,
          executedByName: ctx.user.name },
        reason: input.reason, originalQuantity: entity.quantity, previouslyExcluded: entity.excludedQuantity || 0,
        quantityBefore: before, quantityExcluded: qty, quantityRemaining: remaining,
        effectiveDate: input.effectiveDate, exclusionDate: new Date(), oldEmployeeName: employee?.fullName || null,
        oldDepartmentName: department?.name || null, oldLocationName: location?.name || null,
        responsibleData: input.responsibleData, exclusionImages: input.exclusionImages, excludedBy: ctx.user.id,
      };
      const result = await tx.insert(assetExclusions).values(record);
      await tx.update(table).set({ excludedQuantity: (entity.excludedQuantity || 0) + qty,
        status: remaining === 0 ? "EXCLUDED" : entity.status,
        exclusionDate: record.exclusionDate, excludedBy: ctx.user.name || "النظام",
      }).where(eq(table.id, entity.id));
      await historyAudit(tx, ctx, { entityType: input.entityType, entityId: entity.id, exclusionId: Number(result[0].insertId), tableName: "asset_exclusions", recordId: Number(result[0].insertId),
        actionType: "EXCLUDE", actionDescription: "استبعاد " + code, oldData: entity, newData: record,
      });
      await tx.delete(exclusionDrafts).where(eq(exclusionDrafts.id, input.draftId));
      return { success: true, id: Number(result[0].insertId), record };
    });
  }),
});

// =============================================
// براءة الذمة
// =============================================
const clearanceRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(clearanceRecords).orderBy(desc(clearanceRecords.createdAt));
  }),

  getNextCode: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(clearanceRecords);
    const nextNum = (result?.count || 0) + 1;
    return { code: `CLR-${new Date().getFullYear()}-${String(nextNum).padStart(4, "0")}` };
  }),

  create: operatorProcedure
    .input(z.object({
      clearanceCode: z.string(),
      employeeId: z.number(),
      employeeName: z.string(),
      fingerprintId: z.string().optional().nullable(),
      reason: z.string().optional().nullable(),
      lastWorkDay: z.string().optional().nullable(),
      htmlFilePath: z.string().optional().nullable(),
      replacementData: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(clearanceRecords).values({
        clearanceCode: input.clearanceCode,
        employeeId: input.employeeId,
        employeeName: input.employeeName,
        fingerprintId: input.fingerprintId || null,
        reason: input.reason || null,
        lastWorkDay: input.lastWorkDay ? new Date(input.lastWorkDay) : null,
        htmlFilePath: input.htmlFilePath || null,
        status: "ACTIVE",
        replacementData: input.replacementData || null,
        createdBy: ctx.user.id,
      });

      await logAuditAction({
        tableName: "clearance_records",
        recordId: Number(result[0].insertId),
        actionType: "CLEARANCE",
        actionDescription: `إصدار براءة ذمة للموظف: ${input.employeeName}`,
        newData: input,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });

      return { success: true, id: Number(result[0].insertId) };
    }),

  // الحصول على بيانات براءة ذمة واحدة مع عهد وأصول الموظف
  getById: operatorProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [record] = await db.select().from(clearanceRecords).where(eq(clearanceRecords.id, input.id)).limit(1);
      if (!record) throw new TRPCError({ code: "NOT_FOUND" });

      // جلب رقم هوية الموظف من جدول employees
      const [employeeData] = await db
        .select({ nationalId: employees.nationalId })
        .from(employees)
        .where(eq(employees.id, record.employeeId))
        .limit(1);

      // جلب عهد وأصول الموظف في وقت إصدار البراءة
      const employeeAssets = await db
        .select({
          id: assets.id,
          name: assets.assetName,
          code: assets.assetCode,
          quantity: assets.quantity,
          departmentName: departments.name,
        })
        .from(assets)
        .leftJoin(departments, eq(assets.departmentId, departments.id))
        .where(and(eq(assets.assignedTo, record.employeeId), sql`${assets.status} NOT IN ('DRAFT', 'CANCELLED')`));

      const employeeCustody = await db
        .select({
          id: custodyItems.id,
          name: custodyItems.name,
          code: custodyItems.code,
          quantity: custodyItems.quantity,
          departmentName: departments.name,
        })
        .from(custodyItems)
        .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
        .where(and(eq(custodyItems.assignedTo, record.employeeId), sql`${custodyItems.status} NOT IN ('DRAFT', 'CANCELLED')`));

      return { 
        record, 
        assets: employeeAssets, 
        custody: employeeCustody,
        nationalId: employeeData?.nationalId || null,
      };
    }),

  // الحصول على عناصر موظف (أصول + عهد)
  getEmployeeItems: operatorProcedure
    .input(z.object({ employeeId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const employeeAssets = await db
        .select({
          id: assets.id,
          name: assets.assetName,
          code: assets.assetCode,
          quantity: sql<number>`${assets.quantity} - COALESCE(${assets.excludedQuantity}, 0) - ${assets.warrantyReplacedQuantity}`,
          value: assets.assetValue,
          type: sql<string>`'asset'`,
          departmentName: departments.name,
          locationName: locations.name,
        })
        .from(assets)
        .leftJoin(departments, eq(assets.departmentId, departments.id))
        .leftJoin(locations, eq(assets.locationId, locations.id))
        .where(and(eq(assets.assignedTo, input.employeeId), eq(assets.status, "ACTIVE")));

      const employeeCustody = await db
        .select({
          id: custodyItems.id,
          name: custodyItems.name,
          code: custodyItems.code,
          quantity: sql<number>`${custodyItems.quantity} - COALESCE(${custodyItems.excludedQuantity}, 0) - ${custodyItems.warrantyReplacedQuantity}`,
          value: custodyItems.assetValue,
          type: sql<string>`'custody'`,
          departmentName: departments.name,
          locationName: locations.name,
        })
        .from(custodyItems)
        .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
        .leftJoin(locations, eq(custodyItems.locationId, locations.id))
        .where(and(eq(custodyItems.assignedTo, input.employeeId), eq(custodyItems.status, "ACTIVE")));

      return { assets: employeeAssets, custody: employeeCustody };
    }),

  // حذف براءة ذمة
  delete: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.delete(clearanceRecords).where(eq(clearanceRecords.id, input.id));

      // سجل التدقيق
      await db.insert(auditLog).values({
        tableName: "clearance_records",
        recordId: input.id,
        actionType: "DELETE",
        actionDescription: `حذف براءة ذمة رقم ${input.id}`,
        performedBy: ctx.user?.id || null,
        performedByName: ctx.user?.name || "غير معروف",
      });

      return { success: true };
    }),
});

export const operationsRouter = router({
  transfers: transfersRouter,
  exclusions: exclusionsRouter,
  clearance: clearanceRouter,
});
