/**
 * Records Router - الأرشيف والتقارير وسجل التدقيق
 */
import { z } from "zod";
import { eq, ne, desc, like, and, or, sql, gte, lte } from "drizzle-orm";
import { operatorProcedure, deleteProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  archiveDocuments,
  archiveAudit,
  auditLog,
  assets,
  custodyItems,
  employees,
  departments,
  branches,
  locations,
} from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { TRPCError } from "@trpc/server";
import { archiveRouter } from "../archiveRouter";
import { inventoryTimeline } from "../inventoryTimeline";

// =============================================
// الأرشيف
// =============================================
const reportsRouter = router({
  // تقرير شامل للأصول والعهد
  inventory: operatorProcedure
    .input(z.object({
      type: z.enum(["all", "assets", "custody"]).default("all"),
      search: z.string().optional(),
      employeeId: z.number().optional(),
      departmentId: z.number().optional(),
      locationId: z.number().optional(),
      branchId: z.number().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const results: any[] = [];

      if (!input?.type || input.type === "all" || input.type === "assets") {
        const assetConditions: any[] = [sql`${assets.status} NOT IN ('DRAFT', 'CANCELLED')`];
        if (input?.search) assetConditions.push(or(like(assets.assetName, `%${input.search}%`), like(assets.assetCode, `%${input.search}%`)));
        if (input?.employeeId) assetConditions.push(eq(assets.assignedTo, input.employeeId));
        if (input?.departmentId) assetConditions.push(eq(assets.departmentId, input.departmentId));
        if (input?.locationId) assetConditions.push(eq(assets.locationId, input.locationId));
        if (input?.branchId) assetConditions.push(eq(departments.branchId, input.branchId));
        if (input?.status) assetConditions.push(eq(assets.status, input.status));

        const assetRows = await db
          .select({
            id: assets.id,
            type: sql<string>`'asset'`,
            name: assets.assetName,
            code: assets.assetCode,
            quantity: assets.quantity, warrantyReplacedQuantity: assets.warrantyReplacedQuantity, excludedQuantity: assets.excludedQuantity,
            unitValue: assets.assetValue,
            employeeName: employees.fullName,
            departmentName: departments.name,
            branchId: departments.branchId,
            branchName: branches.name,
            locationName: locations.name,
            status: assets.status,
            notes: assets.notes,
          })
          .from(assets)
          .leftJoin(employees, eq(assets.assignedTo, employees.id))
          .leftJoin(departments, eq(assets.departmentId, departments.id))
          .leftJoin(branches, eq(departments.branchId, branches.id))
          .leftJoin(locations, eq(assets.locationId, locations.id))
          .where(assetConditions.length > 0 ? and(...assetConditions) : undefined);

        results.push(...assetRows.map(r => ({ ...r, type: "asset" as const })));
      }

      if (!input?.type || input.type === "all" || input.type === "custody") {
        const custodyConditions: any[] = [sql`${custodyItems.status} NOT IN ('DRAFT', 'CANCELLED')`];
        if (input?.search) custodyConditions.push(or(like(custodyItems.name, `%${input.search}%`), like(custodyItems.code, `%${input.search}%`)));
        if (input?.employeeId) custodyConditions.push(eq(custodyItems.assignedTo, input.employeeId));
        if (input?.departmentId) custodyConditions.push(eq(custodyItems.departmentId, input.departmentId));
        if (input?.locationId) custodyConditions.push(eq(custodyItems.locationId, input.locationId));
        if (input?.branchId) custodyConditions.push(eq(departments.branchId, input.branchId));
        if (input?.status) custodyConditions.push(eq(custodyItems.status, input.status));

        const custodyRows = await db
          .select({
            id: custodyItems.id,
            type: sql<string>`'custody'`,
            name: custodyItems.name,
            code: custodyItems.code,
            quantity: custodyItems.quantity, warrantyReplacedQuantity: custodyItems.warrantyReplacedQuantity, excludedQuantity: custodyItems.excludedQuantity,
            unitValue: custodyItems.assetValue,
            employeeName: employees.fullName,
            departmentName: departments.name,
            branchId: departments.branchId,
            branchName: branches.name,
            locationName: locations.name,
            status: custodyItems.status,
            notes: custodyItems.notes,
          })
          .from(custodyItems)
          .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
          .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
          .leftJoin(branches, eq(departments.branchId, branches.id))
          .leftJoin(locations, eq(custodyItems.locationId, locations.id))
          .where(custodyConditions.length > 0 ? and(...custodyConditions) : undefined);

        results.push(...custodyRows.map(r => ({ ...r, type: "custody" as const })));
      }

      return results;
    }),

  // إحصائيات لوحة التحكم
  dashboard: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [assetStats] = await db.select({
      count: sql<number>`COUNT(*)`,
      totalValue: sql<string>`COALESCE(SUM(CAST(${assets.assetValue} AS DECIMAL(12,2)) * GREATEST(${assets.quantity} - ${assets.warrantyReplacedQuantity}, 0)), 0)`,
      activeCount: sql<number>`SUM(CASE WHEN ${assets.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
      excludedCount: sql<number>`SUM(CASE WHEN ${assets.status} = 'EXCLUDED' THEN 1 ELSE 0 END)`,
    }).from(assets).where(sql`${assets.status} NOT IN ('DRAFT', 'CANCELLED')`);

    const [custodyStats] = await db.select({
      count: sql<number>`COUNT(*)`,
      totalValue: sql<string>`COALESCE(SUM(CAST(${custodyItems.assetValue} AS DECIMAL(12,2)) * GREATEST(${custodyItems.quantity} - ${custodyItems.warrantyReplacedQuantity}, 0)), 0)`,
      activeCount: sql<number>`SUM(CASE WHEN ${custodyItems.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
      excludedCount: sql<number>`SUM(CASE WHEN ${custodyItems.status} = 'EXCLUDED' THEN 1 ELSE 0 END)`,
    }).from(custodyItems).where(sql`${custodyItems.status} NOT IN ('DRAFT', 'CANCELLED')`);

    const [employeeCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(employees);
    const [departmentCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(departments);
    const [locationCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(locations);

    return {
      assets: assetStats,
      custody: custodyStats,
      employeeCount: employeeCount?.count || 0,
      departmentCount: departmentCount?.count || 0,
      locationCount: locationCount?.count || 0,
    };
  }),
});

// =============================================
// سجل التدقيق
// =============================================
const auditRouter = router({
  list: operatorProcedure
    .input(z.object({
      tableName: z.string().optional(),
      actionType: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const conditions: any[] = [];
      if(ctx.user.role!=="owner")conditions.push(ne(auditLog.tableName,"backup"));
      if (input?.tableName) conditions.push(eq(auditLog.tableName, input.tableName));
      if (input?.actionType) conditions.push(eq(auditLog.actionType, input.actionType));
      if (input?.search) {
        conditions.push(
          or(
            like(auditLog.actionDescription, `%${input.search}%`),
            like(auditLog.performedByName, `%${input.search}%`)
          )
        );
      }
      if (input?.startDate) conditions.push(gte(auditLog.createdAt, new Date(input.startDate)));
      if (input?.endDate) conditions.push(lte(auditLog.createdAt, new Date(input.endDate)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db.select({ total: sql<number>`COUNT(*)` }).from(auditLog).where(where);

      const rows = await db
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(input?.limit || 100)
        .offset(input?.offset || 0);

      return { rows, total: countResult?.total || 0 };
    }),

  // دورة حياة أصل أو عهدة (Timeline)
  getTimeline: operatorProcedure.input(z.object({ entityType: z.enum(["asset", "custody"]), entityId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb(); if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return inventoryTimeline(db, input.entityType, input.entityId);
  }),

  // إحصائيات سجل التدقيق
  stats: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(auditLog);
    
    const byAction = await db
      .select({
        actionType: auditLog.actionType,
        count: sql<number>`COUNT(*)`,
      })
      .from(auditLog)
      .groupBy(auditLog.actionType);

    const byTable = await db
      .select({
        tableName: auditLog.tableName,
        count: sql<number>`COUNT(*)`,
      })
      .from(auditLog)
      .groupBy(auditLog.tableName);

    return {
      total: total?.count || 0,
      byAction,
      byTable,
    };
  }),
});

// =============================================
// التتبع - جلب قائمة الأصول والعهد للبحث
// =============================================
const trackingRouter = router({
  // بحث عن أصول وعهد للتتبع
  search: operatorProcedure
    .input(z.object({
      query: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const q = `%${input.query}%`;

      const assetRows = await db
        .select({
          id: assets.id,
          type: sql<string>`'asset'`,
          name: assets.assetName,
          code: assets.assetCode,
          status: assets.status,
          employeeName: employees.fullName,
        })
        .from(assets)
        .leftJoin(employees, eq(assets.assignedTo, employees.id))
        .where(or(like(assets.assetName, q), like(assets.assetCode, q)))
        .limit(20);

      const custodyRows = await db
        .select({
          id: custodyItems.id,
          type: sql<string>`'custody'`,
          name: custodyItems.name,
          code: custodyItems.code,
          status: custodyItems.status,
          employeeName: employees.fullName,
        })
        .from(custodyItems)
        .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
        .where(or(like(custodyItems.name, q), like(custodyItems.code, q)))
        .limit(20);

      return [
        ...assetRows.map(r => ({ ...r, type: "asset" as const })),
        ...custodyRows.map(r => ({ ...r, type: "custody" as const })),
      ];
    }),
});

export const recordsRouter = router({
  archive: archiveRouter,
  reports: reportsRouter,
  audit: auditRouter,
  tracking: trackingRouter,
});
