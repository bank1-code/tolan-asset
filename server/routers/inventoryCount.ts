import {
  countWorkflowProcedures,
  sessionItems,
} from "../inventoryCountWorkflow";
import {
  visibleCountItems,
  normalizeCountItems,
} from "../../shared/inventoryCount";
import { parseHistoryData } from "../history";
import { canApprove } from "../../shared/roles";
import { remainingQuantity } from "../../shared/inventoryQuantity";
/**
 * Inventory Count Router - الجرد
 */
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
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

export const inventoryCountRouter = router({
  ...countWorkflowProcedures,
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
        .where(
          and(
            eq(assets.departmentId, input.departmentId),
            eq(assets.status, "ACTIVE"),
            sql`${assets.quantity} - COALESCE(${assets.excludedQuantity}, 0) - ${assets.warrantyReplacedQuantity} > 0`
          )
        );
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
        .where(
          and(
            eq(custodyItems.departmentId, input.departmentId),
            eq(custodyItems.status, "ACTIVE"),
            sql`${custodyItems.quantity} - COALESCE(${custodyItems.excludedQuantity}, 0) - ${custodyItems.warrantyReplacedQuantity} > 0`
          )
        );
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
          excludedQuantity: assets.excludedQuantity,
          warrantyReplacedQuantity: assets.warrantyReplacedQuantity,
          serialNumbers: assets.serialNumbers,
          warrantyStartDate: assets.warrantyStartDate,
          warrantyEndDate: assets.warrantyEndDate,
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
        .where(
          and(eq(assets.assetCode, input.code), eq(assets.status, "ACTIVE"))
        )
        .limit(1);

      if (assetRows.length > 0) {
        const row = assetRows[0];
        return {
          found: true as const,
          entityType: "asset" as const,
          id: row.id,
          code: row.assetCode ?? "",
          name: row.assetName,
          quantity: Math.max(0, remainingQuantity(row)),
          originalQuantity: row.quantity,
          warrantyReplacedQuantity: row.warrantyReplacedQuantity,
          serialNumbers: row.serialNumbers,
          warrantyStartDate: row.warrantyStartDate,
          warrantyEndDate: row.warrantyEndDate,
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
          excludedQuantity: custodyItems.excludedQuantity,
          warrantyReplacedQuantity: custodyItems.warrantyReplacedQuantity,
          serialNumbers: custodyItems.serialNumbers,
          warrantyStartDate: custodyItems.warrantyStartDate,
          warrantyEndDate: custodyItems.warrantyEndDate,
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
        .where(
          and(
            eq(custodyItems.code, input.code),
            eq(custodyItems.status, "ACTIVE")
          )
        )
        .limit(1);

      if (custodyRows.length > 0) {
        const row = custodyRows[0];
        return {
          found: true as const,
          entityType: "custody" as const,
          id: row.id,
          code: row.code ?? "",
          name: row.name,
          quantity: Math.max(0, remainingQuantity(row)),
          originalQuantity: row.quantity,
          warrantyReplacedQuantity: row.warrantyReplacedQuantity,
          serialNumbers: row.serialNumbers,
          warrantyStartDate: row.warrantyStartDate,
          warrantyEndDate: row.warrantyEndDate,
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

  // جلب جميع الجلسات
  getSessions: operatorProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const sessions = await db
      .select()
      .from(inventorySessions)
      .orderBy(desc(inventorySessions.createdAt));
    return sessions
      .filter(
        session =>
          session.status === "APPROVED" ||
          canApprove(ctx.user.role) ||
          session.performedBy === ctx.user.id
      )
      .map(session => ({
        ...session,
        status: session.status || "APPROVED",
        sessionType:
          session.sessionType === "asset" ? "assets" : session.sessionType,
        items: visibleCountItems(
          normalizeCountItems(sessionItems(session.items), session.sessionType),
          session.status,
          parseHistoryData(session.scope)
        ),
        scope: parseHistoryData(session.scope),
      }));
  }),

  // حذف جلسة
  deleteSession: deleteProcedure
    .input(z.object({ id: z.number() }))
    .mutation(() => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "جلسة الجرد حدث تاريخي لا يمكن حذفه",
      });
    }),
});
