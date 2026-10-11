import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { operatorProcedure, adminProcedure, approvalProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { assets, custodyItems, employees, departments, branches, locations, auditLog, archiveDocuments, inventoryApprovalNumbers, financialClassifications } from "../drizzle/schema";
import { allocateEntityCode } from "./numbering";
import { historyAudit } from "./history";

const fields = z.object({
  classificationId: z.number().int().positive().nullish(),
  quantity: z.number().int().positive().default(1),
  assetValue: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "القيمة يجب أن تكون مبلغاً موجباً أو صفراً").nullish(),
  condition: z.string().max(50).nullish(),
  assignedTo: z.number().int().nonnegative().default(0),
  departmentId: z.number().int().nonnegative().default(0),
  locationId: z.number().int().nonnegative().default(0),
  notes: z.string().nullish(),
  assetImagePath: z.string().nullish(),
  invoiceImagePath: z.string().nullish(),
});
const identity = z.object({ id: z.number().int().positive() });
const reviewed = identity.extend({ expectedVersion: z.number().int().nonnegative() });

export async function validateDraftAssignment(tx: any, row: any, complete = false) {
  const assignment: Record<string, string | null> = {};
  if (row.classificationId) {
    const [classification] = await tx.select().from(financialClassifications).where(eq(financialClassifications.id, row.classificationId)).limit(1);
    if (!classification?.active) throw new TRPCError({ code: "BAD_REQUEST", message: "التصنيف المالي غير موجود أو غير نشط" });
    assignment.classificationName = classification.name;
    assignment.classificationCode = classification.code;
  }
  if (complete && (!row.locationId || !row.departmentId || !row.assignedTo))
    throw new TRPCError({ code: "BAD_REQUEST", message: "أكمل الموقع والقسم والموظف قبل الاعتماد" });
  if (row.locationId) {
    const [location] = await tx.select().from(locations).where(eq(locations.id, row.locationId)).limit(1);
    if (!location) throw new TRPCError({ code: "BAD_REQUEST", message: "الموقع غير موجود" });
    assignment.locationName = location.name;
  }
  if (row.departmentId) {
    const [department] = await tx.select({ id: departments.id, name: departments.name, locationId: branches.locationId }).from(departments)
      .leftJoin(branches, eq(departments.branchId, branches.id)).where(eq(departments.id, row.departmentId)).limit(1);
    if (!department || (row.locationId && department.locationId !== row.locationId))
      throw new TRPCError({ code: "BAD_REQUEST", message: "القسم لا يتبع الموقع المختار" });
    assignment.departmentName = department.name;
  }
  if (row.assignedTo) {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, row.assignedTo)).limit(1);
    if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف غير موجود" });
    assignment.employeeName = employee.fullName;
  }
  return assignment;
}

export function inventoryLifecycle(kind: "asset" | "custody") {
  const table = kind === "asset" ? assets : custodyItems;
  const tableName = kind === "asset" ? "assets" : "custody_items";
  const nameKey = kind === "asset" ? "assetName" : "name";
  const codeKey = kind === "asset" ? "assetCode" : "code";
  const inputSchema = fields.extend({ assetName: z.string().trim().min(1).max(500).optional(), name: z.string().trim().min(1).max(500).optional(),
    assetCode: z.null().optional(), code: z.null().optional() }).strict();
  async function database() {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db;
  }
  async function lockDraft(tx: any, id: number, expectedVersion?: number) {
    const [row] = await tx.select().from(table).where(eq(table.id, id)).limit(1).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (row.status !== "DRAFT") throw new TRPCError({ code: "FORBIDDEN", message: "السجل مقفل؛ التعديل والإلغاء متاحان للمسودة فقط" });
    if (expectedVersion !== undefined && row.draftVersion !== expectedVersion)
      throw new TRPCError({ code: "CONFLICT", message: "تغيرت المسودة أثناء المراجعة؛ حدّث البيانات وراجعها مجدداً" });
    return row;
  }
  async function audit(tx: any, ctx: any, id: number, action: string, oldData: any, newData: any) {
    const labels: Record<string, string> = { CREATE: "حفظ مسودة", UPDATE: "تعديل مسودة", APPROVE: "اعتماد وقفل البيانات", REVIEW: "طلب تصحيح المسودة", CANCEL: "إلغاء المسودة" };
    await historyAudit(tx, ctx, { entityType: kind, entityId: id, tableName, recordId: id, actionType: action,
      actionDescription: `${labels[action] || action}: ${newData?.[nameKey] ?? oldData?.[nameKey] ?? id}`,
      oldData, newData });
  }
  const normalize = (input: any) => {
    if (!input[nameKey]) throw new TRPCError({ code: "BAD_REQUEST", message: "الاسم مطلوب" });
    return ({ [nameKey]: input[nameKey], quantity: input.quantity,
    classificationId: input.classificationId ?? null,
    assetValue: input.assetValue ?? "0", condition: input.condition ?? "جيد جدًا",
    assignedTo: input.assignedTo || null, departmentId: input.departmentId || null, locationId: input.locationId || null,
    notes: input.notes || null, assetImagePath: input.assetImagePath || null, invoiceImagePath: input.invoiceImagePath || null });
  };

  return {
    create: operatorProcedure.input(inputSchema).mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const data = { ...normalize(input), [codeKey]: null, status: "DRAFT", draftVersion: 0 };
        await validateDraftAssignment(tx, data);
        const result = await tx.insert(table).values(data as any);
        const id = Number(result[0].insertId);
        await audit(tx, ctx, id, "CREATE", null, data);
        return { id, assetCode: null, code: null, status: "DRAFT" };
      });
    }),
    update: operatorProcedure.input(inputSchema.extend({ id: identity.shape.id, expectedVersion: z.number().int().nonnegative() })).mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const old = await lockDraft(tx, input.id, input.expectedVersion);
        const data = { ...normalize(input), draftVersion: old.draftVersion + 1 };
        await validateDraftAssignment(tx, data);
        await tx.update(table).set(data as any).where(eq(table.id, input.id));
        await audit(tx, ctx, input.id, "UPDATE", old, { ...old, ...data });
        return { success: true };
      });
    }),
    approve: approvalProcedure.input(reviewed).mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const old = await lockDraft(tx, input.id, input.expectedVersion);
        const assignment = await validateDraftAssignment(tx, old, true);
        const numbering = await allocateEntityCode(tx, old.locationId!, kind);
        await tx.insert(inventoryApprovalNumbers).values({ entityType: kind, entityId: input.id, code: numbering.code, approvedBy: ctx.user.id });
        const approvedAt = new Date();
        const snapshot = { ...old, ...assignment, [codeKey]: numbering.code, status: "ACTIVE", originLocationId: old.locationId,
          approvedBy: ctx.user.id, approvedByName: ctx.user.name, approvedAt: approvedAt.toISOString() };
        await tx.update(table).set({ [codeKey]: numbering.code, status: "ACTIVE", originLocationId: old.locationId,
          approvedBy: ctx.user.id, approvedAt, approvalSnapshot: snapshot, reviewNote: null, draftVersion: old.draftVersion + 1 } as any).where(eq(table.id, input.id));
        await audit(tx, ctx, input.id, "APPROVE", old, snapshot);
        return { success: true, code: numbering.code };
      });
    }),
    requestChanges: approvalProcedure.input(reviewed.extend({ note: z.string().trim().min(1).max(2000) })).mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const old = await lockDraft(tx, input.id, input.expectedVersion);
        const data = { ...old, reviewNote: input.note, draftVersion: old.draftVersion + 1 };
        await tx.update(table).set({ reviewNote: input.note, draftVersion: data.draftVersion }).where(eq(table.id, input.id));
        await audit(tx, ctx, input.id, "REVIEW", old, data);
        return { success: true };
      });
    }),
    cancelDraft: operatorProcedure.input(reviewed).mutation(async ({ input, ctx }) => {
      const db = await database();
      return db.transaction(async tx => {
        const old = await lockDraft(tx, input.id, input.expectedVersion);
        await tx.update(table).set({ status: "CANCELLED", draftVersion: old.draftVersion + 1 }).where(eq(table.id, input.id));
        await audit(tx, ctx, input.id, "CANCEL", old, { ...old, status: "CANCELLED" });
        return { success: true };
      });
    }),
    delete: adminProcedure.input(identity).mutation(() => {
      throw new TRPCError({ code: "FORBIDDEN", message: "الحذف الفعلي ممنوع؛ يمكن إلغاء المسودة فقط" });
    }),
  };
}
