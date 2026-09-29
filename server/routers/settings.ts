/**
 * Settings Router - إعدادات النظام
 * أقسام، مواقع، موظفين، أنواع استبعاد
 */
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { protectedProcedure, operatorProcedure, adminProcedure, deleteProcedure, ownerProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  departments,
  locations,
  employees,
  exclusionTypes,
  appSettings,
} from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { TRPCError } from "@trpc/server";

// =============================================
// الأقسام
// =============================================
const departmentsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "قاعدة البيانات غير متاحة" });
    return db.select({
      id: departments.id, name: departments.name, locationId: departments.locationId,
      locationName: locations.name, createdAt: departments.createdAt, updatedAt: departments.updatedAt,
    }).from(departments).leftJoin(locations, eq(departments.locationId, locations.id)).orderBy(departments.name);
  }),

  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255).transform(s => s.trim()).refine(s => s.length > 0, { message: "الاسم مطلوب" }), locationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [location] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
      if (!location) throw new TRPCError({ code: "BAD_REQUEST", message: "الموقع المحدد غير موجود" });
      const result = await db.insert(departments).values({ name: input.name, locationId: input.locationId });
      const insertId = Number(result[0].insertId);
      await logAuditAction({
        tableName: "departments",
        recordId: insertId,
        actionType: "CREATE",
        actionDescription: `إضافة قسم: ${input.name}`,
        newData: { name: input.name, locationId: input.locationId },
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { id: insertId, name: input.name, locationId: input.locationId };
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(255), locationId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(departments).where(eq(departments.id, input.id)).limit(1);
      const [location] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, input.locationId)).limit(1);
      if (!location) throw new TRPCError({ code: "BAD_REQUEST", message: "الموقع المحدد غير موجود" });
      await db.update(departments).set({ name: input.name, locationId: input.locationId }).where(eq(departments.id, input.id));
      await logAuditAction({
        tableName: "departments",
        recordId: input.id,
        actionType: "UPDATE",
        actionDescription: `تعديل قسم: ${old?.name} → ${input.name}`,
        oldData: old,
        newData: { name: input.name, locationId: input.locationId },
        changedFields: ["name", "locationId"],
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),

  delete: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(departments).where(eq(departments.id, input.id)).limit(1);
      await db.delete(departments).where(eq(departments.id, input.id));
      await logAuditAction({
        tableName: "departments",
        recordId: input.id,
        actionType: "DELETE",
        actionDescription: `حذف قسم: ${old?.name}`,
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
// المواقع
// =============================================
const locationsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(locations).orderBy(locations.name);
  }),

  create: adminProcedure
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

  update: adminProcedure
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

  delete: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(locations).where(eq(locations.id, input.id)).limit(1);
      await db.delete(locations).where(eq(locations.id, input.id));
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
      departmentName: departments.name, locationId: departments.locationId, locationName: locations.name,
      fingerprintId: employees.fingerprintId, nationalId: employees.nationalId, phone: employees.phone,
      createdAt: employees.createdAt, updatedAt: employees.updatedAt,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(locations, eq(departments.locationId, locations.id))
      .orderBy(employees.fullName);
  }),

  create: adminProcedure
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

  update: adminProcedure
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

  delete: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(employees).where(eq(employees.id, input.id)).limit(1);
      await db.delete(employees).where(eq(employees.id, input.id));
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

  create: adminProcedure
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

  delete: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [old] = await db.select().from(exclusionTypes).where(eq(exclusionTypes.id, input.id)).limit(1);
      await db.delete(exclusionTypes).where(eq(exclusionTypes.id, input.id));
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
  locations: locationsRouter,
  employees: employeesRouter,
  exclusionTypes: exclusionTypesRouter,
  branding: brandingRouter,
});
