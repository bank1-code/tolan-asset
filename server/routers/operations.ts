/**
 * Operations Router - النقل والاستبعاد وبراءة الذمة
 */
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { operatorProcedure, deleteProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  assets,
  custodyItems,
  employees,
  departments,
  locations,
  assetTransfers,
  assetExclusions,
  exclusionTypes,
  clearanceRecords,
  exclusionSequence,
  auditLog,
} from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { TRPCError } from "@trpc/server";


async function resolveTransferDestination(db: any, employeeId: number, locationId: number, departmentId: number) {
  const [employee] = await db.select({ id: employees.id }).from(employees)
    .where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new TRPCError({ code: "BAD_REQUEST", message: "الموظف المستلم غير موجود" });

  const [department] = await db.select({
    id: departments.id,
    name: departments.name,
    locationId: departments.locationId,
    locationName: locations.name,
  }).from(departments)
    .leftJoin(locations, eq(departments.locationId, locations.id))
    .where(eq(departments.id, departmentId)).limit(1);
  if (!department) throw new TRPCError({ code: "BAD_REQUEST", message: "القسم الجديد غير موجود" });
  if (department.locationId !== locationId) {
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
const transfersRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(assetTransfers).orderBy(desc(assetTransfers.createdAt));
  }),

  getById: operatorProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [transfer] = await db.select().from(assetTransfers).where(eq(assetTransfers.id, input.id)).limit(1);
      if (!transfer) throw new TRPCError({ code: "NOT_FOUND" });
      let entityName = "";
      if (transfer.entityType === "asset") {
        const [a] = await db.select({ name: assets.assetName }).from(assets).where(eq(assets.id, transfer.entityId)).limit(1);
        entityName = a?.name || "";
      } else {
        const [c] = await db.select({ name: custodyItems.name }).from(custodyItems).where(eq(custodyItems.id, transfer.entityId)).limit(1);
        entityName = c?.name || "";
      }
      let fromEmployeeName = "";
      let toEmployeeName = "";
      if (transfer.fromEmployeeId) {
        const fromId = transfer.fromEmployeeId;
        const [e] = await db.select({ fullName: employees.fullName }).from(employees).where(eq(employees.id, fromId)).limit(1);
        fromEmployeeName = e?.fullName || "";
      }
      const toEmpId = transfer.toEmployeeId;
      const [toEmp] = toEmpId ? await db.select({ fullName: employees.fullName }).from(employees).where(eq(employees.id, toEmpId)).limit(1) : [undefined];
      toEmployeeName = toEmp?.fullName || "";
      return { ...transfer, entityName, fromEmployeeName, toEmployeeName };
    }),

  update: operatorProcedure
    .input(z.object({
      id: z.number(),
      fromEmployeeId: z.number().optional().nullable(),
      toEmployeeId: z.number(),
      notes: z.string().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(assetTransfers).set({
        fromEmployeeId: input.fromEmployeeId || null,
        toEmployeeId: input.toEmployeeId,
        notes: input.notes || null,
      }).where(eq(assetTransfers.id, input.id));
      await logAuditAction({
        tableName: "asset_transfers",
        recordId: input.id,
        actionType: "UPDATE",
        actionDescription: `تعديل عملية نقل #${input.id}`,
        newData: input,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });
      return { success: true };
    }),

  create: operatorProcedure
    .input(z.object({
      entityType: z.enum(["asset", "custody"]),
      entityId: z.number(),
      movementType: z.enum(["total", "partial"]),
      fromEmployeeId: z.number().optional().nullable(),
      toEmployeeId: z.number(),
      toDepartmentId: z.number(),
      toLocationId: z.number(),
      fromDepartment: z.string().optional().nullable(),
      toDepartment: z.string().optional().nullable(),
      fromLocation: z.string().optional().nullable(),
      toLocation: z.string().optional().nullable(),
      quantity: z.number().min(1).default(1),
      assetValue: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      // For partial transfer - items to transfer
      items: z.array(z.object({
        entityType: z.enum(["asset", "custody"]),
        entityId: z.number(),
        quantity: z.number().min(1),
      })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const destination = await resolveTransferDestination(db, input.toEmployeeId, input.toLocationId, input.toDepartmentId);

      if (input.movementType === "total") {
        // نقل كلي - نقل جميع عناصر الموظف
        const table = input.entityType === "asset" ? assets : custodyItems;
        const assignedToCol = input.entityType === "asset" ? assets.assignedTo : custodyItems.assignedTo;
        let affectedEntityIds: number[] = [];

        // نحفظ معرفات كل العناصر المتأثرة لضمان بقاء سجل الحركة قابلاً للتحقق لاحقاً.
        if (input.fromEmployeeId) {
          const affected = await db.select({ id: table.id }).from(table).where(eq(assignedToCol, input.fromEmployeeId));
          affectedEntityIds = affected.map((row: any) => Number(row.id));
          await db.update(table).set({
            assignedTo: input.toEmployeeId,
            departmentId: destination.departmentId,
            locationId: destination.locationId,
          }).where(eq(assignedToCol, input.fromEmployeeId));
        }

        // تسجيل النقل
        const result = await db.insert(assetTransfers).values({
          entityType: input.entityType,
          entityId: input.entityId,
          movementType: "total",
          fromEmployeeId: input.fromEmployeeId || null,
          toEmployeeId: input.toEmployeeId,
          fromDepartment: input.fromDepartment || null,
          toDepartment: destination.departmentName || input.toDepartment || null,
          fromLocation: input.fromLocation || null,
          toLocation: destination.locationName || input.toLocation || null,
          quantity: input.quantity,
          assetValue: input.assetValue || null,
          notes: input.notes || null,
          transferredBy: ctx.user.id,
        });

        await logAuditAction({
          tableName: "asset_transfers",
          recordId: Number(result[0].insertId),
          actionType: "TRANSFER",
          actionDescription: `نقل كلي ${input.entityType === "asset" ? "أصول" : "عهد"} من موظف #${input.fromEmployeeId} إلى موظف #${input.toEmployeeId}`,
          newData: { ...input, affectedEntityIds },
          performedBy: ctx.user.id,
          performedByName: ctx.user.name || undefined,
          ipAddress: ctx.req.ip || undefined,
          userAgent: ctx.req.headers["user-agent"] || undefined,
        });

        return { success: true, id: Number(result[0].insertId) };
      } else {
        // نقل عنصر محدد: الموظف والموقع والقسم الجديد مستقلة عن القسم الوظيفي للموظف.
        let current: any;
        if (input.entityType === "asset") {
          [current] = await db.select({
            id: assets.id, name: assets.assetName, code: assets.assetCode, quantity: assets.quantity,
            assignedTo: assets.assignedTo, departmentId: assets.departmentId, departmentName: departments.name,
            locationId: assets.locationId, locationName: locations.name, status: assets.status,
          }).from(assets)
            .leftJoin(departments, eq(assets.departmentId, departments.id))
            .leftJoin(locations, eq(assets.locationId, locations.id))
            .where(eq(assets.id, input.entityId)).limit(1);
        } else {
          [current] = await db.select({
            id: custodyItems.id, name: custodyItems.name, code: custodyItems.code, quantity: custodyItems.quantity,
            assignedTo: custodyItems.assignedTo, departmentId: custodyItems.departmentId, departmentName: departments.name,
            locationId: custodyItems.locationId, locationName: locations.name, status: custodyItems.status,
          }).from(custodyItems)
            .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
            .leftJoin(locations, eq(custodyItems.locationId, locations.id))
            .where(eq(custodyItems.id, input.entityId)).limit(1);
        }

        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل أو العهدة المحددة غير موجودة" });
        if (current.status !== "ACTIVE") throw new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن نقل عنصر غير نشط" });

        if (input.entityType === "asset") {
          await db.update(assets).set({ assignedTo: input.toEmployeeId, departmentId: destination.departmentId, locationId: destination.locationId })
            .where(eq(assets.id, input.entityId));
        } else {
          await db.update(custodyItems).set({ assignedTo: input.toEmployeeId, departmentId: destination.departmentId, locationId: destination.locationId })
            .where(eq(custodyItems.id, input.entityId));
        }

        const result = await db.insert(assetTransfers).values({
          entityType: input.entityType,
          entityId: input.entityId,
          movementType: "partial",
          fromEmployeeId: current.assignedTo || null,
          toEmployeeId: input.toEmployeeId,
          fromDepartment: current.departmentName || null,
          toDepartment: destination.departmentName || null,
          fromLocation: current.locationName || null,
          toLocation: destination.locationName || null,
          quantity: current.quantity || 1,
          assetValue: input.assetValue || null,
          notes: input.notes || null,
          transferredBy: ctx.user.id,
        });

        await logAuditAction({
          tableName: "asset_transfers",
          recordId: Number(result[0].insertId),
          actionType: "TRANSFER",
          actionDescription: `نقل ${input.entityType === "asset" ? "أصل" : "عهدة"} #${input.entityId} إلى موظف #${input.toEmployeeId}`,
          oldData: current,
          newData: { ...input, destination },
          performedBy: ctx.user.id,
          performedByName: ctx.user.name || undefined,
          ipAddress: ctx.req.ip || undefined,
          userAgent: ctx.req.headers["user-agent"] || undefined,
        });

        return { success: true, id: Number(result[0].insertId) };
      }
    }),
});

// =============================================
// الاستبعاد
// =============================================
const exclusionsRouter = router({
  list: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(assetExclusions).orderBy(desc(assetExclusions.createdAt));
  }),

  getNextCode: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const year = new Date().getFullYear();
    const [existing] = await db.select().from(exclusionSequence).where(eq(exclusionSequence.year, year)).limit(1);
    const nextSeq = existing ? existing.seq + 1 : 1;
    return { code: `EXC-${year}-${String(nextSeq).padStart(4, "0")}`, seq: nextSeq };
  }),

  create: operatorProcedure
    .input(z.object({
      entityType: z.enum(["asset", "custody"]),
      entityId: z.number(),
      exclusionCode: z.string(),
      exclusionMode: z.enum(["full", "partial"]),
      exclusionTypeId: z.number().optional().nullable(),
      reason: z.string().min(1),
      quantityBefore: z.number().optional(),
      quantityExcluded: z.number().min(1).default(1),
      quantityRemaining: z.number().optional(),
      oldEmployeeName: z.string().optional().nullable(),
      oldDepartmentName: z.string().optional().nullable(),
      oldLocationName: z.string().optional().nullable(),
      responsibleData: z.any().optional(),
      exclusionImages: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // تحديث تسلسل الاستبعاد
      const year = new Date().getFullYear();
      const [existing] = await db.select().from(exclusionSequence).where(eq(exclusionSequence.year, year)).limit(1);
      if (existing) {
        await db.update(exclusionSequence).set({ seq: existing.seq + 1 }).where(eq(exclusionSequence.id, existing.id));
      } else {
        await db.insert(exclusionSequence).values({ year, seq: 1 });
      }

      // تحديث الكمية المستبعدة في الأصل/العهدة
      const table = input.entityType === "asset" ? assets : custodyItems;
      const [entity] = await db.select().from(table).where(eq(table.id, input.entityId)).limit(1);
      if (!entity) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.exclusionMode === "full") {
        await db.update(table).set({
          status: "EXCLUDED",
          excludedQuantity: entity.quantity,
          exclusionDate: new Date(),
          excludedBy: ctx.user.name || "النظام",
        }).where(eq(table.id, input.entityId));
      } else {
        const newExcluded = (entity.excludedQuantity || 0) + input.quantityExcluded;
        const remaining = entity.quantity - newExcluded;
        await db.update(table).set({
          excludedQuantity: newExcluded,
          status: remaining <= 0 ? "EXCLUDED" : "ACTIVE",
          exclusionDate: new Date(),
          excludedBy: ctx.user.name || "النظام",
        }).where(eq(table.id, input.entityId));
      }

      // إنشاء سجل الاستبعاد
      const result = await db.insert(assetExclusions).values({
        entityType: input.entityType,
        entityId: input.entityId,
        exclusionCode: input.exclusionCode,
        exclusionMode: input.exclusionMode,
        exclusionTypeId: input.exclusionTypeId || null,
        reason: input.reason,
        quantityBefore: input.quantityBefore ?? entity.quantity,
        quantityExcluded: input.quantityExcluded,
        quantityRemaining: input.quantityRemaining ?? (entity.quantity - input.quantityExcluded),
        oldEmployeeName: input.oldEmployeeName || null,
        oldDepartmentName: input.oldDepartmentName || null,
        oldLocationName: input.oldLocationName || null,
        responsibleData: input.responsibleData || null,
        exclusionImages: input.exclusionImages || null,
        excludedBy: ctx.user.id,
      });

      await logAuditAction({
        tableName: "asset_exclusions",
        recordId: Number(result[0].insertId),
        actionType: "EXCLUDE",
        actionDescription: `استبعاد ${input.exclusionMode === "full" ? "كلي" : "جزئي"} - ${input.entityType === "asset" ? "أصل" : "عهدة"} #${input.entityId}: ${input.reason}`,
        newData: input,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });

      return { success: true, id: Number(result[0].insertId) };
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
        .where(eq(assets.assignedTo, record.employeeId));

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
        .where(eq(custodyItems.assignedTo, record.employeeId));

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
          quantity: assets.quantity,
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
          quantity: custodyItems.quantity,
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
