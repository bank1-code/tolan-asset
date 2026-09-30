/**
 * Settings Router - إعدادات النظام
 * أقسام، مواقع، موظفين، أنواع استبعاد
 */
import { z } from "zod";
import { eq, or, sql } from "drizzle-orm";
import { protectedProcedure, operatorProcedure, ownerProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  departments,
  branches,
  locations,
  employees,
  exclusionTypes,
  assets,
  custodyItems,
  assetTransfers,
  assetExclusions,
  clearanceRecords,
  inventorySessions,
  users,
  appSettings,
} from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { TRPCError } from "@trpc/server";

function rethrowDeleteConstraint(error: unknown, entityLabel: string): never {
  const dbError = error as {
    code?: string;
    errno?: number;
    cause?: { code?: string; errno?: number };
  };
  const code = dbError?.code ?? dbError?.cause?.code;
  const errno = dbError?.errno ?? dbError?.cause?.errno;
  if (code === "ER_ROW_IS_REFERENCED_2" || errno === 1451) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `لا يمكن حذف ${entityLabel} لأنه مرتبط ببيانات أخرى في النظام. يجب فك الارتباط أولاً.`,
    });
  }
  throw error;
}

// =============================================
// الأقسام
// =============================================
const departmentsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return db.select({
      id: departments.id, name: departments.name, branchId: departments.branchId, locationId: departments.locationId,
      branchName: branches.name, locationName: locations.name, createdAt: departments.createdAt, updatedAt: departments.updatedAt,
    }).from(departments)
      .leftJoin(branches, eq(departments.branchId, branches.id))
      .leftJoin(locations, eq(branches.locationId, locations.id))
      .orderBy(departments.name);
  }),
  create: operatorProcedure.input(z.object({ name: z.string().trim().min(1).max(255), branchId: z.number() })).mutation(async ({ input, ctx }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [branch] = await db.select({ id: branches.id, locationId: branches.locationId }).from(branches).where(eq(branches.id, input.branchId)).limit(1);
    if (!branch) throw new TRPCError({ code: "BAD_REQUEST", message: "الفرع المحدد غير موجود" });
    const result = await db.insert(departments).values({ name: input.name, branchId: input.branchId, locationId: branch.locationId });
    const id = Number(result[0].insertId);
    await logAuditAction({ tableName:"departments", recordId:id, actionType:"CREATE", actionDescription:`إضافة قسم: ${input.name}`, newData:input, performedBy:ctx.user.id, performedByName:ctx.user.name||undefined, ipAddress:ctx.req.ip||undefined, userAgent:ctx.req.headers["user-agent"]||undefined });
    return { id, ...input, locationId: branch.locationId };
  }),
  update: operatorProcedure.input(z.object({ id:z.number(), name:z.string().trim().min(1).max(255), branchId:z.number() })).mutation(async ({ input, ctx }) => {
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const [old]=await db.select().from(departments).where(eq(departments.id,input.id)).limit(1);
    const [branch]=await db.select({id:branches.id,locationId:branches.locationId}).from(branches).where(eq(branches.id,input.branchId)).limit(1);
    if(!branch) throw new TRPCError({code:"BAD_REQUEST",message:"الفرع المحدد غير موجود"});
    await db.update(departments).set({name:input.name,branchId:input.branchId,locationId:branch.locationId}).where(eq(departments.id,input.id));
    await logAuditAction({tableName:"departments",recordId:input.id,actionType:"UPDATE",actionDescription:`تعديل قسم: ${old?.name} → ${input.name}`,oldData:old,newData:input,changedFields:["name","branchId"],performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined});
    return {success:true};
  }),
  delete: operatorProcedure.input(z.object({id:z.number()})).mutation(async ({input,ctx})=>{
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const [old]=await db.select().from(departments).where(eq(departments.id,input.id)).limit(1); if(!old) throw new TRPCError({code:"NOT_FOUND",message:"القسم غير موجود"});
    if((await db.select({id:employees.id}).from(employees).where(eq(employees.departmentId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف القسم لأنه مرتبط بموظفين."});
    if((await db.select({id:assets.id}).from(assets).where(eq(assets.departmentId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف القسم لأنه مرتبط بأصول مسجلة."});
    if((await db.select({id:custodyItems.id}).from(custodyItems).where(eq(custodyItems.departmentId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف القسم لأنه مرتبط بعهد مسجلة."});
    if((await db.select({id:inventorySessions.id}).from(inventorySessions).where(eq(inventorySessions.departmentId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف القسم لأنه مرتبط بجلسات جرد."});
    try { await db.delete(departments).where(eq(departments.id,input.id)); } catch(e){ rethrowDeleteConstraint(e,"القسم"); }
    await logAuditAction({tableName:"departments",recordId:input.id,actionType:"DELETE",actionDescription:`حذف قسم: ${old.name}`,oldData:old,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {success:true};
  }),
});

// =============================================
// الفروع
// =============================================
const branchesRouter = router({
  list: operatorProcedure.query(async()=>{ const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); return db.select({id:branches.id,name:branches.name,locationId:branches.locationId,locationName:locations.name,createdAt:branches.createdAt,updatedAt:branches.updatedAt}).from(branches).leftJoin(locations,eq(branches.locationId,locations.id)).orderBy(branches.name); }),
  create: operatorProcedure.input(z.object({name:z.string().trim().min(1).max(255),locationId:z.number()})).mutation(async({input,ctx})=>{ const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); if(!(await db.select({id:locations.id}).from(locations).where(eq(locations.id,input.locationId)).limit(1))[0]) throw new TRPCError({code:"BAD_REQUEST",message:"الموقع المحدد غير موجود"}); const r=await db.insert(branches).values(input); const id=Number(r[0].insertId); await logAuditAction({tableName:"branches",recordId:id,actionType:"CREATE",actionDescription:`إضافة فرع: ${input.name}`,newData:input,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {id,...input}; }),
  update: operatorProcedure.input(z.object({id:z.number(),name:z.string().trim().min(1).max(255),locationId:z.number()})).mutation(async({input,ctx})=>{ const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); const [old]=await db.select().from(branches).where(eq(branches.id,input.id)).limit(1); if(!old) throw new TRPCError({code:"NOT_FOUND",message:"الفرع غير موجود"}); await db.update(branches).set({name:input.name,locationId:input.locationId}).where(eq(branches.id,input.id)); await db.update(departments).set({locationId:input.locationId}).where(eq(departments.branchId,input.id)); await db.update(assets).set({locationId:input.locationId}).where(sql`${assets.departmentId} IN (SELECT id FROM departments WHERE branchId = ${input.id})`); await db.update(custodyItems).set({locationId:input.locationId}).where(sql`${custodyItems.departmentId} IN (SELECT id FROM departments WHERE branchId = ${input.id})`); await logAuditAction({tableName:"branches",recordId:input.id,actionType:"UPDATE",actionDescription:`تعديل فرع: ${old.name} → ${input.name}`,oldData:old,newData:input,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {success:true}; }),
  delete: operatorProcedure.input(z.object({id:z.number()})).mutation(async({input,ctx})=>{ const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); const [old]=await db.select().from(branches).where(eq(branches.id,input.id)).limit(1); if(!old) throw new TRPCError({code:"NOT_FOUND",message:"الفرع غير موجود"}); if((await db.select({id:departments.id}).from(departments).where(eq(departments.branchId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف الفرع لأنه مرتبط بأقسام. انقل الأقسام أولاً."}); await db.delete(branches).where(eq(branches.id,input.id)); await logAuditAction({tableName:"branches",recordId:input.id,actionType:"DELETE",actionDescription:`حذف فرع: ${old.name}`,oldData:old,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {success:true}; })
});

// =============================================
// المواقع
// =============================================
const locationsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(locations).orderBy(locations.name);
  }),

  create: operatorProcedure
    .input(z.object({ name: z.string().min(1).max(255).transform(s => s.trim()).refine(s => s.length > 0, { message: "الاسم مطلوب" }) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(locations).values({ name: input.name });
      const insertId = Number(result[0].insertId);
      await logAuditAction({
        tableName: "locations",
        recordId: insertId,
        actionType: "CREATE",
        actionDescription: `إضافة موقع: ${input.name}`,
        newData: { name: input.name },
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { id: insertId, name: input.name };
    }),

  update: operatorProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(locations).where(eq(locations.id, input.id)).limit(1);
      await db.update(locations).set({ name: input.name }).where(eq(locations.id, input.id));
      await logAuditAction({
        tableName: "locations",
        recordId: input.id,
        actionType: "UPDATE",
        actionDescription: `تعديل موقع: ${old?.name} → ${input.name}`,
        oldData: old,
        newData: { name: input.name },
        changedFields: ["name"],
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(locations).where(eq(locations.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "الموقع غير موجود" });

      const [linkedBranch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.locationId, input.id)).limit(1);
      if (linkedBranch) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بفروع. انقل أو احذف الفروع المرتبطة أولاً." });
      }
      const [linkedAsset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.locationId, input.id)).limit(1);
      if (linkedAsset) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بأصول مسجلة. انقل الأصول إلى موقع آخر أولاً." });
      }
      const [linkedCustody] = await db.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.locationId, input.id)).limit(1);
      if (linkedCustody) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بعهد مسجلة. انقل العهد إلى موقع آخر أولاً." });
      }

      try {
        await db.delete(locations).where(eq(locations.id, input.id));
      } catch (error) {
        rethrowDeleteConstraint(error, "الموقع");
      }
      await logAuditAction({
        tableName: "locations",
        recordId: input.id,
        actionType: "DELETE",
        actionDescription: `حذف موقع: ${old?.name}`,
        oldData: old,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),
});

// =============================================
// الموظفين
// =============================================
const employeesRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select({
      id: employees.id, fullName: employees.fullName, departmentId: employees.departmentId,
      departmentName: departments.name, branchId: departments.branchId, branchName: branches.name, locationId: branches.locationId, locationName: locations.name,
      fingerprintId: employees.fingerprintId, nationalId: employees.nationalId, phone: employees.phone,
      createdAt: employees.createdAt, updatedAt: employees.updatedAt,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(branches, eq(departments.branchId, branches.id))
      .leftJoin(locations, eq(branches.locationId, locations.id))
      .orderBy(employees.fullName);
  }),

  create: operatorProcedure
    .input(z.object({
      fullName: z.string().min(1).max(255),
      departmentId: z.number(),
      fingerprintId: z.string().max(100).optional().nullable(),
      nationalId: z.string().max(100).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [department] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1);
      if (!department) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم المحدد غير موجود" });
      const result = await db.insert(employees).values({
        fullName: input.fullName,
        departmentId: input.departmentId,
        fingerprintId: input.fingerprintId || null,
        nationalId: input.nationalId || null,
        phone: input.phone || null,
      });
      const insertId = Number(result[0].insertId);
      await logAuditAction({
        tableName: "employees",
        recordId: insertId,
        actionType: "CREATE",
        actionDescription: `إضافة موظف: ${input.fullName}`,
        newData: input,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { id: insertId, ...input };
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.number(),
      fullName: z.string().min(1).max(255),
      departmentId: z.number(),
      fingerprintId: z.string().max(100).optional().nullable(),
      nationalId: z.string().max(100).optional().nullable(),
      phone: z.string().max(50).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      const [department] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1);
      if (!department) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم المحدد غير موجود" });
      await db.update(employees).set({
        fullName: input.fullName,
        departmentId: input.departmentId,
        fingerprintId: input.fingerprintId || null,
        nationalId: input.nationalId || null,
        phone: input.phone || null,
      }).where(eq(employees.id, input.id));
      // تحديد الحقول المتغيرة
      const changedFields: string[] = [];
      if (old?.fullName !== input.fullName) changedFields.push('fullName');
      if (old?.departmentId !== input.departmentId) changedFields.push('departmentId');
      if (old?.fingerprintId !== (input.fingerprintId || null)) changedFields.push('fingerprintId');
      if (old?.nationalId !== (input.nationalId || null)) changedFields.push('nationalId');
      if (old?.phone !== (input.phone || null)) changedFields.push('phone');

      await logAuditAction({
        tableName: "employees",
        recordId: input.id,
        actionType: "UPDATE",
        actionDescription: `تعديل موظف: ${old?.fullName} - تغيير ${changedFields.length} حقل`,
        oldData: old,
        newData: input,
        changedFields,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود" });

      const [linkedUser] = await db.select({ id: users.id }).from(users).where(eq(users.employeeId, input.id)).limit(1);
      if (linkedUser) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بحساب مستخدم في النظام. افصل حساب المستخدم عن الموظف أولاً." });
      }
      const [linkedAsset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.assignedTo, input.id)).limit(1);
      if (linkedAsset) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بأصول مسجلة. انقل الأصول إلى موظف آخر أولاً." });
      }
      const [linkedCustody] = await db.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.assignedTo, input.id)).limit(1);
      if (linkedCustody) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بعهد مسجلة. انقل العهد إلى موظف آخر أولاً." });
      }
      const [linkedTransfer] = await db
        .select({ id: assetTransfers.id })
        .from(assetTransfers)
        .where(or(eq(assetTransfers.fromEmployeeId, input.id), eq(assetTransfers.toEmployeeId, input.id)))
        .limit(1);
      if (linkedTransfer) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لوجود حركات نقل مرتبطة به. يجب الاحتفاظ بالموظف حفاظاً على سجل الحركات." });
      }
      const [linkedClearance] = await db.select({ id: clearanceRecords.id }).from(clearanceRecords).where(eq(clearanceRecords.employeeId, input.id)).limit(1);
      if (linkedClearance) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لوجود سجل براءة ذمة مرتبط به. يجب الاحتفاظ بالموظف حفاظاً على السجل." });
      }

      try {
        await db.delete(employees).where(eq(employees.id, input.id));
      } catch (error) {
        rethrowDeleteConstraint(error, "الموظف");
      }
      await logAuditAction({
        tableName: "employees",
        recordId: input.id,
        actionType: "DELETE",
        actionDescription: `حذف موظف: ${old?.fullName}`,
        oldData: old,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),
});

// =============================================
// أنواع الاستبعاد
// =============================================
const exclusionTypesRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(exclusionTypes).orderBy(exclusionTypes.name);
  }),

  create: operatorProcedure
    .input(z.object({ name: z.string().min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.insert(exclusionTypes).values({ name: input.name });
      const insertId = Number(result[0].insertId);
      await logAuditAction({
        tableName: "exclusion_types",
        recordId: insertId,
        actionType: "CREATE",
        actionDescription: `إضافة نوع استبعاد: ${input.name}`,
        newData: { name: input.name },
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { id: insertId, name: input.name };
    }),

  delete: operatorProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(exclusionTypes).where(eq(exclusionTypes.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "نوع الاستبعاد غير موجود" });

      const [linkedExclusion] = await db.select({ id: assetExclusions.id }).from(assetExclusions).where(eq(assetExclusions.exclusionTypeId, input.id)).limit(1);
      if (linkedExclusion) {
        throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف نوع الاستبعاد لأنه مستخدم في عمليات استبعاد مسجلة. يجب الاحتفاظ به حفاظاً على سجل العمليات." });
      }

      try {
        await db.delete(exclusionTypes).where(eq(exclusionTypes.id, input.id));
      } catch (error) {
        rethrowDeleteConstraint(error, "نوع الاستبعاد");
      }
      await logAuditAction({
        tableName: "exclusion_types",
        recordId: input.id,
        actionType: "DELETE",
        actionDescription: `حذف نوع استبعاد: ${old?.name}`,
        oldData: old,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),
});

// =============================================
// هوية النظام - القراءة لكل مستخدم مسجل، والتعديل للمسؤول فقط
// =============================================
// إنشاء جدول الهوية تلقائياً عند أول استخدام لضمان عمل التحديث مباشرة بعد النشر
async function ensureBrandingTable(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      id int NOT NULL,
      systemName varchar(150) NOT NULL DEFAULT 'إدارة العهد والأصول',
      systemSubtitle varchar(200) NOT NULL DEFAULT 'نظام سحابي متكامل',
      logoUrl text,
      updatedBy int,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT app_settings_updatedBy_users_id_fk FOREIGN KEY (updatedBy) REFERENCES users(id)
    )
  `);
}

const brandingRouter = router({
  get: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    await ensureBrandingTable(db);
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
    return row ?? {
      id: 1,
      systemName: "إدارة العهد والأصول",
      systemSubtitle: "نظام سحابي متكامل",
      logoUrl: null,
      updatedBy: null,
      createdAt: null,
      updatedAt: null,
    };
  }),

  update: ownerProcedure
    .input(z.object({
      systemName: z.string().trim().min(1).max(150),
      systemSubtitle: z.string().trim().max(200),
      logoUrl: z.string().trim().min(1).max(2048).nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
      await ensureBrandingTable(db);
      const values = {
        id: 1,
        systemName: input.systemName,
        systemSubtitle: input.systemSubtitle,
        logoUrl: input.logoUrl,
        updatedBy: ctx.user.id,
      };
      await db.insert(appSettings).values(values).onDuplicateKeyUpdate({
        set: {
          systemName: input.systemName,
          systemSubtitle: input.systemSubtitle,
          logoUrl: input.logoUrl,
          updatedBy: ctx.user.id,
        },
      });
      await logAuditAction({
        tableName: "app_settings", recordId: 1, actionType: "UPDATE",
        actionDescription: "تحديث هوية النظام", newData: input,
        performedBy: ctx.user.id, performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true, ...values };
    }),
});

// =============================================
// تجميع الإعدادات
// =============================================
export const settingsRouter = router({
  departments: departmentsRouter,
  branches: branchesRouter,
  locations: locationsRouter,
  employees: employeesRouter,
  exclusionTypes: exclusionTypesRouter,
  branding: brandingRouter,
});
