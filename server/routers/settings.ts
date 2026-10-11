import { createHierarchyRecord } from "../hierarchyCreation";
/**
 * Settings Router - إعدادات النظام
 * أقسام، مواقع، موظفين، أنواع استبعاد
 */
import { z } from "zod";
import { and, eq, ne, or, sql, inArray } from "drizzle-orm";
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
import { isValidNumberPrefix, normalizeNumberPrefix } from "../numbering";

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
// الترميز الهرمي: الموقع → الفرع → القسم → الموظف
// =============================================
const prefixInput = z.string().trim().max(40).optional().nullable();

async function assertHierarchyEmpty(tx: any, departmentIds: number[]) {
  if (!departmentIds.length) return;
  for (const table of [assets, custodyItems, employees]) {
    const [linked] = await tx.select({id:table.id}).from(table).where(inArray(table.departmentId, departmentIds)).limit(1);
    if (linked) throw new TRPCError({code:'CONFLICT',message:'لا يمكن تغيير تبعية قسم أو فرع مرتبط بموظفين أو أصول أو عهد. استخدم حركات النقل المعتمدة؛ لن تتغير مواقع السجلات من الإعدادات.'});
  }
}

function validatePrefix(prefix: string | null, label: string) {
  if (prefix && !isValidNumberPrefix(prefix)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} يجب أن تتكون من أحرف أو أرقام وشرطة (-) فقط، مثل RYD-AST.`,
    });
  }
}

async function assertPrefixAvailable(db: any, kind: "asset" | "custody", prefix: string | null, excludeLocationId?: number) {
  if (!prefix) return;
  const column = kind === "asset" ? locations.assetPrefix : locations.custodyPrefix;
  const condition = excludeLocationId
    ? and(eq(column, prefix), ne(locations.id, excludeLocationId))
    : eq(column, prefix);
  const [duplicate] = await db.select({ id: locations.id, name: locations.name }).from(locations).where(condition).limit(1);
  if (duplicate) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `البادئة «${prefix}» مستخدمة بالفعل في الموقع «${duplicate.name}». اختر بادئة مختلفة.`,
    });
  }
}

const padCode = (value: number, width: number) => String(value).padStart(width, "0");
const makeBranchCode = (locationCode: string, seq: number) => `${locationCode}-${padCode(seq, 2)}`;
const makeDepartmentCode = (branchCode: string, seq: number) => `${branchCode}-${padCode(seq, 3)}`;
const makeEmployeeCode = (departmentCode: string, seq: number) => `${departmentCode}-${padCode(seq, 4)}`;

async function ensureAppSettingsRow(tx: any) {
  await tx.insert(appSettings).values({ id: 1 }).onDuplicateKeyUpdate({ set: { id: 1 } });
}

async function cascadeBranchHierarchyCodes(tx: any, branchId: number, branchCode: string, locationId: number) {
  const childDepartments = await tx.select().from(departments).where(eq(departments.branchId, branchId));
  for (const department of childDepartments) {
    if (!department.sequenceNo) continue;
    const departmentCode = makeDepartmentCode(branchCode, department.sequenceNo);
    await tx.update(departments).set({ code: departmentCode, locationId }).where(eq(departments.id, department.id));
    const departmentEmployees = await tx.select().from(employees).where(eq(employees.departmentId, department.id));
    for (const employee of departmentEmployees) {
      if (!employee.sequenceNo) continue;
      await tx.update(employees)
        .set({ code: makeEmployeeCode(departmentCode, employee.sequenceNo) })
        .where(eq(employees.id, employee.id));
    }
  }
}

async function cascadeDepartmentEmployeeCodes(tx: any, departmentId: number, departmentCode: string) {
  const departmentEmployees = await tx.select().from(employees).where(eq(employees.departmentId, departmentId));
  for (const employee of departmentEmployees) {
    if (!employee.sequenceNo) continue;
    await tx.update(employees)
      .set({ code: makeEmployeeCode(departmentCode, employee.sequenceNo) })
      .where(eq(employees.id, employee.id));
  }
}

// =============================================
// الأقسام
// =============================================
const departmentsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return db.select({
      id: departments.id,
      name: departments.name,
      code: departments.code,
      sequenceNo: departments.sequenceNo,
      branchId: departments.branchId,
      locationId: departments.locationId,
      branchName: branches.name,
      branchCode: branches.code,
      locationName: locations.name,
      locationCode: locations.code,
      createdAt: departments.createdAt,
      updatedAt: departments.updatedAt,
    }).from(departments)
      .leftJoin(branches, eq(departments.branchId, branches.id))
      .leftJoin(locations, eq(branches.locationId, locations.id))
      .orderBy(departments.code, departments.name);
  }),

  create: operatorProcedure
    .input(z.object({ name: z.string().trim().min(1).max(255), branchId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const created = await db.transaction(tx => createHierarchyRecord(tx, "departments", input));
      await logAuditAction({ tableName:"departments", recordId:created.id, actionType:"CREATE", actionDescription:`إضافة قسم: ${input.name} (${created.code})`, newData:{...input,...created}, performedBy:ctx.user.id, performedByName:ctx.user.name||undefined, ipAddress:ctx.req.ip||undefined, userAgent:ctx.req.headers["user-agent"]||undefined });
      return { ...created, ...input };
    }),

  update: operatorProcedure
    .input(z.object({ id:z.number(), name:z.string().trim().min(1).max(255), branchId:z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db=await getDb();
      if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
      const [old]=await db.select().from(departments).where(eq(departments.id,input.id)).limit(1);
      if(!old) throw new TRPCError({code:"NOT_FOUND",message:"القسم غير موجود"});

      await db.transaction(async (tx) => {
        const [lockedDepartment] = await tx.select().from(departments).where(eq(departments.id,input.id)).for('update');
        if (!lockedDepartment) throw new TRPCError({code:'NOT_FOUND'});
        if (lockedDepartment.branchId !== input.branchId) {
          await assertHierarchyEmpty(tx, [input.id]);
        }
        const [branch]=await tx.select().from(branches).where(eq(branches.id,input.branchId)).limit(1);
        if(!branch || !branch.code) throw new TRPCError({code:"BAD_REQUEST",message:"الفرع المحدد غير موجود أو لا يملك كوداً"});

        if (old.branchId !== input.branchId || !old.code || !old.sequenceNo) {
          await tx.execute(sql`SELECT id FROM branches WHERE id = ${input.branchId} FOR UPDATE`);
          const [lockedBranch] = await tx.select().from(branches).where(eq(branches.id,input.branchId)).limit(1);
          if(!lockedBranch || !lockedBranch.code) throw new TRPCError({code:"BAD_REQUEST",message:"الفرع المحدد غير موجود"});
          const sequenceNo = Number(lockedBranch.departmentSequence) + 1;
          const code = makeDepartmentCode(lockedBranch.code, sequenceNo);
          await tx.update(branches).set({ departmentSequence: sequenceNo }).where(eq(branches.id, lockedBranch.id));
          await tx.update(departments).set({name:input.name,branchId:input.branchId,locationId:lockedBranch.locationId,code,sequenceNo}).where(eq(departments.id,input.id));
          await cascadeDepartmentEmployeeCodes(tx, input.id, code);
        } else {
          await tx.update(departments).set({name:input.name,locationId:branch.locationId}).where(eq(departments.id,input.id));
        }
      });

      const [updated] = await db.select().from(departments).where(eq(departments.id,input.id)).limit(1);
      await logAuditAction({tableName:"departments",recordId:input.id,actionType:"UPDATE",actionDescription:`تعديل قسم: ${old.name} → ${input.name}`,oldData:old,newData:updated,changedFields:["name","branchId","code"],performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined});
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
  list: operatorProcedure.query(async()=>{
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    return db.select({
      id:branches.id,name:branches.name,code:branches.code,sequenceNo:branches.sequenceNo,locationId:branches.locationId,
      locationName:locations.name,locationCode:locations.code,createdAt:branches.createdAt,updatedAt:branches.updatedAt,
    }).from(branches).leftJoin(locations,eq(branches.locationId,locations.id)).orderBy(branches.code, branches.name);
  }),

  create: operatorProcedure.input(z.object({name:z.string().trim().min(1).max(255),locationId:z.number()})).mutation(async({input,ctx})=>{
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const created = await db.transaction(tx => createHierarchyRecord(tx, "branches", input));
      await logAuditAction({tableName:"branches",recordId:created.id,actionType:"CREATE",actionDescription:`إضافة فرع: ${input.name} (${created.code})`,newData:{...input,...created},performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined});
    return {...created,...input};
  }),

  update: operatorProcedure.input(z.object({id:z.number(),name:z.string().trim().min(1).max(255),locationId:z.number()})).mutation(async({input,ctx})=>{
    const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"});
    const [old]=await db.select().from(branches).where(eq(branches.id,input.id)).limit(1); if(!old) throw new TRPCError({code:"NOT_FOUND",message:"الفرع غير موجود"});
    await db.transaction(async (tx) => {
      const [lockedBranch] = await tx.select().from(branches).where(eq(branches.id,input.id)).for('update');
      if (!lockedBranch) throw new TRPCError({code:'NOT_FOUND'});
      if (lockedBranch.locationId !== input.locationId) {
        const childDepartments = await tx.select({id:departments.id}).from(departments).where(eq(departments.branchId,input.id)).for('update');
        await assertHierarchyEmpty(tx, childDepartments.map(department => department.id));
      }
      if (old.locationId !== input.locationId || !old.code || !old.sequenceNo) {
        await tx.execute(sql`SELECT id FROM locations WHERE id = ${input.locationId} FOR UPDATE`);
        const [location] = await tx.select().from(locations).where(eq(locations.id,input.locationId)).limit(1);
        if(!location || !location.code) throw new TRPCError({code:"BAD_REQUEST",message:"الموقع المحدد غير موجود"});
        const sequenceNo = Number(location.branchSequence) + 1;
        const code = makeBranchCode(location.code, sequenceNo);
        await tx.update(locations).set({branchSequence:sequenceNo}).where(eq(locations.id,location.id));
        await tx.update(branches).set({name:input.name,locationId:input.locationId,code,sequenceNo}).where(eq(branches.id,input.id));
        await cascadeBranchHierarchyCodes(tx,input.id,code,input.locationId);
      } else {
        await tx.update(branches).set({name:input.name}).where(eq(branches.id,input.id));
      }
    });
    const [updated]=await db.select().from(branches).where(eq(branches.id,input.id)).limit(1);
    await logAuditAction({tableName:"branches",recordId:input.id,actionType:"UPDATE",actionDescription:`تعديل فرع: ${old.name} → ${input.name}`,oldData:old,newData:updated,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {success:true};
  }),

  delete: operatorProcedure.input(z.object({id:z.number()})).mutation(async({input,ctx})=>{ const db=await getDb(); if(!db) throw new TRPCError({code:"INTERNAL_SERVER_ERROR"}); const [old]=await db.select().from(branches).where(eq(branches.id,input.id)).limit(1); if(!old) throw new TRPCError({code:"NOT_FOUND",message:"الفرع غير موجود"}); if((await db.select({id:departments.id}).from(departments).where(eq(departments.branchId,input.id)).limit(1))[0]) throw new TRPCError({code:"CONFLICT",message:"لا يمكن حذف الفرع لأنه مرتبط بأقسام. انقل الأقسام أولاً."}); await db.delete(branches).where(eq(branches.id,input.id)); await logAuditAction({tableName:"branches",recordId:input.id,actionType:"DELETE",actionDescription:`حذف فرع: ${old.name}`,oldData:old,performedBy:ctx.user.id,performedByName:ctx.user.name||undefined,ipAddress:ctx.req.ip||undefined,userAgent:ctx.req.headers["user-agent"]||undefined}); return {success:true}; })
});

// =============================================
// المواقع + إعداد بادئات ترقيم الأصول والعهد
// =============================================
const locationsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(locations).orderBy(locations.code, locations.name);
  }),

  create: operatorProcedure
    .input(z.object({
      name: z.string().min(1).max(255).transform(s => s.trim()).refine(s => s.length > 0, { message: "الاسم مطلوب" }),
      assetPrefix: prefixInput,
      custodyPrefix: prefixInput,
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const assetPrefix = normalizeNumberPrefix(input.assetPrefix);
      const custodyPrefix = normalizeNumberPrefix(input.custodyPrefix);
      validatePrefix(assetPrefix, "بادئة الأصول");
      validatePrefix(custodyPrefix, "بادئة العهد");
      const created = await db.transaction(tx => createHierarchyRecord(tx, "locations", input));
      await logAuditAction({ tableName: "locations", recordId: created.id, actionType: "CREATE", actionDescription: `إضافة موقع: ${input.name} (${created.code})`, newData: { ...input, ...created, assetPrefix, custodyPrefix }, performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
      return { ...created, name: input.name, assetPrefix, custodyPrefix };
    }),

  update: operatorProcedure
    .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(255), assetPrefix: prefixInput, custodyPrefix: prefixInput }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const result = await db.transaction(async (tx) => {
        // نفس القفل الذي يستخدمه مولد الأرقام؛ يمنع تعديل البادئة أثناء توليد رقم جديد.
        await tx.execute(sql`SELECT id FROM locations WHERE id = ${input.id} FOR UPDATE`);
        const [old] = await tx.select().from(locations).where(eq(locations.id, input.id)).limit(1);
        if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "الموقع غير موجود" });

        const assetPrefix = input.assetPrefix === undefined ? old.assetPrefix : normalizeNumberPrefix(input.assetPrefix);
        const custodyPrefix = input.custodyPrefix === undefined ? old.custodyPrefix : normalizeNumberPrefix(input.custodyPrefix);
        validatePrefix(assetPrefix, "بادئة الأصول");
        validatePrefix(custodyPrefix, "بادئة العهد");

        if (old.assetPrefixLocked && assetPrefix !== old.assetPrefix) {
          throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل بادئة الأصول لهذا الموقع بعد بدء الترقيم الآلي." });
        }
        if (old.custodyPrefixLocked && custodyPrefix !== old.custodyPrefix) {
          throw new TRPCError({ code: "CONFLICT", message: "لا يمكن تعديل بادئة العهد لهذا الموقع بعد بدء الترقيم الآلي." });
        }

        await assertPrefixAvailable(tx, "asset", assetPrefix, input.id);
        await assertPrefixAvailable(tx, "custody", custodyPrefix, input.id);
        await tx.update(locations).set({ name: input.name, assetPrefix, custodyPrefix }).where(eq(locations.id, input.id));
        return { old, assetPrefix, custodyPrefix };
      });

      await logAuditAction({ tableName: "locations", recordId: input.id, actionType: "UPDATE", actionDescription: `تعديل موقع: ${result.old.name} → ${input.name}`, oldData: result.old, newData: { name: input.name, assetPrefix: result.assetPrefix, custodyPrefix: result.custodyPrefix }, changedFields: ["name", "assetPrefix", "custodyPrefix"], performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
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
      if (linkedBranch) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بفروع. انقل أو احذف الفروع المرتبطة أولاً." });
      const [linkedAsset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.locationId, input.id)).limit(1);
      if (linkedAsset) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بأصول مسجلة. انقل الأصول إلى موقع آخر أولاً." });
      const [linkedCustody] = await db.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.locationId, input.id)).limit(1);
      if (linkedCustody) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه مرتبط بعهد مسجلة. انقل العهد إلى موقع آخر أولاً." });
      const [originAsset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.originLocationId, input.id)).limit(1);
      const [originCustody] = await db.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.originLocationId, input.id)).limit(1);
      if (originAsset || originCustody) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموقع لأنه موقع تسجيل أصلي لأرقام أصول أو عهد تاريخية." });
      try { await db.delete(locations).where(eq(locations.id, input.id)); } catch (error) { rethrowDeleteConstraint(error, "الموقع"); }
      await logAuditAction({ tableName: "locations", recordId: input.id, actionType: "DELETE", actionDescription: `حذف موقع: ${old.name}`, oldData: old, performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
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
      id: employees.id, fullName: employees.fullName, code: employees.code, sequenceNo: employees.sequenceNo, departmentId: employees.departmentId,
      departmentName: departments.name, departmentCode: departments.code, branchId: departments.branchId, branchName: branches.name, branchCode: branches.code,
      locationId: branches.locationId, locationName: locations.name, locationCode: locations.code,
      fingerprintId: employees.fingerprintId, nationalId: employees.nationalId, phone: employees.phone,
      createdAt: employees.createdAt, updatedAt: employees.updatedAt,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(branches, eq(departments.branchId, branches.id))
      .leftJoin(locations, eq(branches.locationId, locations.id))
      .orderBy(employees.code, employees.fullName);
  }),

  create: operatorProcedure
    .input(z.object({ fullName: z.string().min(1).max(255), departmentId: z.number(), fingerprintId: z.string().max(100).optional().nullable(), nationalId: z.string().max(100).optional().nullable(), phone: z.string().max(50).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const created = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM departments WHERE id = ${input.departmentId} FOR UPDATE`);
        const [department] = await tx.select().from(departments).where(eq(departments.id, input.departmentId)).limit(1);
        if (!department || !department.code) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم المحدد غير موجود أو لا يملك كوداً" });
        const sequenceNo = Number(department.employeeSequence) + 1;
        const code = makeEmployeeCode(department.code, sequenceNo);
        await tx.update(departments).set({employeeSequence:sequenceNo}).where(eq(departments.id,department.id));
        const result = await tx.insert(employees).values({ fullName: input.fullName, code, sequenceNo, departmentId: input.departmentId, fingerprintId: input.fingerprintId || null, nationalId: input.nationalId || null, phone: input.phone || null });
        return {id:Number(result[0].insertId),code,sequenceNo};
      });
      await logAuditAction({ tableName: "employees", recordId: created.id, actionType: "CREATE", actionDescription: `إضافة موظف: ${input.fullName} (${created.code})`, newData: {...input,...created}, performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
      return { ...created, ...input };
    }),

  update: operatorProcedure
    .input(z.object({ id: z.number(), fullName: z.string().min(1).max(255), departmentId: z.number(), fingerprintId: z.string().max(100).optional().nullable(), nationalId: z.string().max(100).optional().nullable(), phone: z.string().max(50).optional().nullable() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      if (!old) throw new TRPCError({ code: "NOT_FOUND", message: "الموظف غير موجود" });

      await db.transaction(async (tx) => {
        let code = old.code;
        let sequenceNo = old.sequenceNo;
        if (old.departmentId !== input.departmentId || !code || !sequenceNo) {
          await tx.execute(sql`SELECT id FROM departments WHERE id = ${input.departmentId} FOR UPDATE`);
          const [department] = await tx.select().from(departments).where(eq(departments.id, input.departmentId)).limit(1);
          if (!department || !department.code) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم المحدد غير موجود أو لا يملك كوداً" });
          sequenceNo = Number(department.employeeSequence) + 1;
          code = makeEmployeeCode(department.code, sequenceNo);
          await tx.update(departments).set({employeeSequence:sequenceNo}).where(eq(departments.id,department.id));
        }
        await tx.update(employees).set({ fullName: input.fullName, code, sequenceNo, departmentId: input.departmentId, fingerprintId: input.fingerprintId || null, nationalId: input.nationalId || null, phone: input.phone || null }).where(eq(employees.id, input.id));
      });

      const [updated] = await db.select().from(employees).where(eq(employees.id,input.id)).limit(1);
      const changedFields: string[] = [];
      if (old.fullName !== input.fullName) changedFields.push('fullName');
      if (old.departmentId !== input.departmentId) changedFields.push('departmentId', 'code');
      if (old.fingerprintId !== (input.fingerprintId || null)) changedFields.push('fingerprintId');
      if (old.nationalId !== (input.nationalId || null)) changedFields.push('nationalId');
      if (old.phone !== (input.phone || null)) changedFields.push('phone');
      await logAuditAction({ tableName: "employees", recordId: input.id, actionType: "UPDATE", actionDescription: `تعديل موظف: ${old.fullName} - تغيير ${changedFields.length} حقل`, oldData: old, newData: updated, changedFields, performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
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
      if (linkedUser) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بحساب مستخدم في النظام. افصل حساب المستخدم عن الموظف أولاً." });
      const [linkedAsset] = await db.select({ id: assets.id }).from(assets).where(eq(assets.assignedTo, input.id)).limit(1);
      if (linkedAsset) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بأصول مسجلة. انقل الأصول إلى موظف آخر أولاً." });
      const [linkedCustody] = await db.select({ id: custodyItems.id }).from(custodyItems).where(eq(custodyItems.assignedTo, input.id)).limit(1);
      if (linkedCustody) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لأنه مرتبط بعهد مسجلة. انقل العهد إلى موظف آخر أولاً." });
      const [linkedTransfer] = await db.select({ id: assetTransfers.id }).from(assetTransfers).where(or(eq(assetTransfers.fromEmployeeId, input.id), eq(assetTransfers.toEmployeeId, input.id))).limit(1);
      if (linkedTransfer) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لوجود حركات نقل مرتبطة به. يجب الاحتفاظ بالموظف حفاظاً على سجل الحركات." });
      const [linkedClearance] = await db.select({ id: clearanceRecords.id }).from(clearanceRecords).where(eq(clearanceRecords.employeeId, input.id)).limit(1);
      if (linkedClearance) throw new TRPCError({ code: "CONFLICT", message: "لا يمكن حذف الموظف لوجود سجل براءة ذمة مرتبط به. يجب الاحتفاظ بالموظف حفاظاً على السجل." });
      try { await db.delete(employees).where(eq(employees.id, input.id)); } catch (error) { rethrowDeleteConstraint(error, "الموظف"); }
      await logAuditAction({ tableName: "employees", recordId: input.id, actionType: "DELETE", actionDescription: `حذف موظف: ${old.fullName}`, oldData: old, performedBy: ctx.user.id, performedByName: ctx.user.name || undefined, ipAddress: ctx.req.ip || undefined, userAgent: ctx.req.headers["user-agent"] || undefined });
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
      locationSequence int NOT NULL DEFAULT 0,
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
