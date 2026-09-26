/**
 * Inventory Count Router - الجرد
 */
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { operatorProcedure, deleteProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  inventorySessions,
  assets,
  custodyItems,
  departments,
  locations,
  employees,
} from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { logAuditAction } from "../security";

export const inventoryCountRouter = router({
  // جلب الأصول حسب القسم
  getAssetsByDepartment: operatorProcedure
    .input(z.object({ departmentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select({
          id: assets.id,
          code: assets.assetCode,
          name: assets.assetName,
        })
        .from(assets)
        .where(eq(assets.departmentId, input.departmentId));
    }),

  // جلب العهد حسب القسم
  getCustodyByDepartment: operatorProcedure
    .input(z.object({ departmentId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db
        .select({
          id: custodyItems.id,
          code: custodyItems.code,
          name: custodyItems.name,
        })
        .from(custodyItems)
        .where(eq(custodyItems.departmentId, input.departmentId));
    }),

  // البحث عن أصل أو عهدة بالكود (للاستعراض عبر NFC)
  lookupByCode: operatorProcedure
    .input(z.object({ code: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // البحث في الأصول مع join
      const assetRows = await db
        .select({
          id: assets.id,
          assetCode: assets.assetCode,
          assetName: assets.assetName,
          quantity: assets.quantity,
          assetValue: assets.assetValue,
          condition: assets.condition,
          status: assets.status,
          notes: assets.notes,
          assetImagePath: assets.assetImagePath,
          invoiceImagePath: assets.invoiceImagePath,
          createdAt: assets.createdAt,
          departmentName: departments.name,
          locationName: locations.name,
          assignedToName: employees.fullName,
        })
        .from(assets)
        .leftJoin(departments, eq(assets.departmentId, departments.id))
        .leftJoin(locations, eq(assets.locationId, locations.id))
        .leftJoin(employees, eq(assets.assignedTo, employees.id))
        .where(eq(assets.assetCode, input.code))
        .limit(1);

      if (assetRows.length > 0) {
        const row = assetRows[0];
        return {
          found: true as const,
          entityType: "asset" as const,
          id: row.id,
          code: row.assetCode ?? "",
          name: row.assetName,
          quantity: row.quantity,
          assetValue: row.assetValue,
          condition: row.condition,
          status: row.status,
          notes: row.notes,
          assetImagePath: row.assetImagePath,
          invoiceImagePath: row.invoiceImagePath,
          departmentName: row.departmentName ?? null,
          locationName: row.locationName ?? null,
          assignedToName: row.assignedToName ?? null,
          createdAt: row.createdAt,
        };
      }

      // البحث في العهد مع join
      const custodyRows = await db
        .select({
          id: custodyItems.id,
          code: custodyItems.code,
          name: custodyItems.name,
          quantity: custodyItems.quantity,
          assetValue: custodyItems.assetValue,
          condition: custodyItems.condition,
          status: custodyItems.status,
          notes: custodyItems.notes,
          assetImagePath: custodyItems.assetImagePath,
          invoiceImagePath: custodyItems.invoiceImagePath,
          createdAt: custodyItems.createdAt,
          departmentName: departments.name,
          locationName: locations.name,
          assignedToName: employees.fullName,
        })
        .from(custodyItems)
        .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
        .leftJoin(locations, eq(custodyItems.locationId, locations.id))
        .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
        .where(eq(custodyItems.code, input.code))
        .limit(1);

      if (custodyRows.length > 0) {
        const row = custodyRows[0];
        return {
          found: true as const,
          entityType: "custody" as const,
          id: row.id,
          code: row.code ?? "",
          name: row.name,
          quantity: row.quantity,
          assetValue: row.assetValue,
          condition: row.condition,
          status: row.status,
          notes: row.notes,
          assetImagePath: row.assetImagePath,
          invoiceImagePath: row.invoiceImagePath,
          departmentName: row.departmentName ?? null,
          locationName: row.locationName ?? null,
          assignedToName: row.assignedToName ?? null,
          createdAt: row.createdAt,
        };
      }

      return { found: false as const };
    }),

  // حفظ جلسة جرد
  saveSession: operatorProcedure
    .input(
      z.object({
        departmentId: z.number().optional(),
        departmentName: z.string().optional(),
        sessionType: z.enum(["assets", "custody"]),
        totalCount: z.number(),
        scannedCount: z.number(),
        missingCount: z.number(),
        items: z.array(
          z.object({
            id: z.number(),
            code: z.string(),
            name: z.string(),
            status: z.enum(["scanned", "missing"]),
          })
        ),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(inventorySessions).values({
        departmentId: input.departmentId ?? null,
        departmentName: input.departmentName ?? null,
        sessionType: input.sessionType,
        totalCount: input.totalCount,
        scannedCount: input.scannedCount,
        missingCount: input.missingCount,
        items: input.items,
        performedBy: ctx.user?.id ?? null,
        performedByName: ctx.user?.name ?? null,
      });

      await logAuditAction({
        tableName: "inventory_sessions",
        recordId: Number(result[0].insertId),
        actionType: "INVENTORY",
        actionDescription: `جلسة جرد ${input.sessionType === "assets" ? "أصول" : "عهد"} - ${input.items.length} عنصر`,
        newData: input,
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
        ipAddress: ctx.req.ip || undefined,
        userAgent: ctx.req.headers["user-agent"] || undefined,
      });

      return { success: true, id: Number(result[0].insertId) };
    }),

  // جلب جميع الجلسات
  getSessions: operatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db
      .select()
      .from(inventorySessions)
      .orderBy(desc(inventorySessions.createdAt));
  }),

  // حذف جلسة
  deleteSession: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(inventorySessions).where(eq(inventorySessions.id, input.id));
      return { success: true };
    }),
});
