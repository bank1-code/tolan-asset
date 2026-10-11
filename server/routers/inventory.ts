/**
 * Inventory Router - الأصول والعهد
 */
import { z } from "zod";
import { eq, like, and, or, sql, desc } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  assets,
  custodyItems,
  employees,
  departments,
  branches,
  locations,
} from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";
import { inventoryLifecycle } from "../inventoryLifecycle";

const inventoryFilters = z.object({
  search: z.string().max(200).optional(),
  departmentId: z.number().optional(), locationId: z.number().optional(), status: z.string().optional(),
});
const inventoryPage = inventoryFilters.extend({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10000000).default(0),
}).optional();
function inventoryWhere(kind: "asset" | "custody", input: z.infer<typeof inventoryFilters> | undefined, user: {role: string; employeeId?: number | null}) {
  const table = kind === "asset" ? assets : custodyItems;
  const name = kind === "asset" ? assets.assetName : custodyItems.name;
  const code = kind === "asset" ? assets.assetCode : custodyItems.code;
  const conditions = [];
  if (input?.search?.trim()) {
    const q = '%' + input.search.trim() + '%';
    conditions.push(or(...[name, code, employees.fullName, departments.name, locations.name, table.condition, table.status, table.notes].map(column => like(column, q)), sql`CAST(${table.assetValue} AS CHAR) LIKE ${q}`));
  }
  if (input?.departmentId) conditions.push(eq(table.departmentId, input.departmentId));
  if (input?.locationId) conditions.push(eq(table.locationId, input.locationId));
  if (input?.status) conditions.push(eq(table.status, input.status as any));
  if (user.role === "employee") {
    if (!user.employeeId) throw new TRPCError({code: "FORBIDDEN", message: "الحساب غير مرتبط بسجل موظف"});
    conditions.push(eq(table.assignedTo, user.employeeId), sql`${table.status} NOT IN ('DRAFT', 'CANCELLED')`);
  }
  return conditions.length ? and(...conditions) : undefined;
}
function inventoryCount(kind: "asset" | "custody") {
  return protectedProcedure.input(inventoryFilters.optional()).query(async ({input, ctx}) => {
    const db = await getDb();
    if (!db) throw new TRPCError({code: "INTERNAL_SERVER_ERROR"});
    const table = kind === "asset" ? assets : custodyItems;
    const [row] = await db.select({total: sql<number>`COUNT(*)`}).from(table)
      .leftJoin(employees, eq(table.assignedTo, employees.id))
      .leftJoin(departments, eq(table.departmentId, departments.id))
      .leftJoin(locations, eq(table.locationId, locations.id))
      .where(inventoryWhere(kind, input, ctx.user));
    return Number(row.total);
  });
}

// =============================================
// الأصول
// =============================================
const assetsRouter = router({
  count: inventoryCount("asset"),
  list: protectedProcedure
    .input(inventoryPage)
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const where = inventoryWhere("asset", input, ctx.user);

      const rows = db
        .select({
          id: assets.id,
          assetName: assets.assetName,
          assetCode: assets.assetCode,
          quantity: assets.quantity,
          assetValue: assets.assetValue, classificationId: assets.classificationId,
          condition: assets.condition,
          assignedTo: assets.assignedTo,
          employeeName: employees.fullName,
          departmentId: assets.departmentId,
          departmentName: departments.name,
          branchId: departments.branchId,
          branchName: branches.name,
          locationId: assets.locationId,
          originLocationId: assets.originLocationId,
          locationName: locations.name,
          status: assets.status,
          draftVersion: assets.draftVersion, approvedBy: assets.approvedBy, approvedAt: assets.approvedAt,
          approvalSnapshot: assets.approvalSnapshot, reviewNote: assets.reviewNote,
          notes: assets.notes,
          assetImagePath: assets.assetImagePath,
          invoiceImagePath: assets.invoiceImagePath,
          excludedQuantity: assets.excludedQuantity, warrantyReplacedQuantity: assets.warrantyReplacedQuantity, serialNumbers: assets.serialNumbers, warrantyStartDate: assets.warrantyStartDate, warrantyEndDate: assets.warrantyEndDate,
          createdAt: assets.createdAt,
          updatedAt: assets.updatedAt,
        })
        .from(assets)
        .leftJoin(employees, eq(assets.assignedTo, employees.id))
        .leftJoin(departments, eq(assets.departmentId, departments.id))
        .leftJoin(branches, eq(departments.branchId, branches.id))
        .leftJoin(locations, eq(assets.locationId, locations.id))
        .where(where)
        .orderBy(desc(assets.createdAt), desc(assets.id));
      if (input?.limit) rows.limit(input.limit).offset(input.offset ?? 0);

      return await rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({
          id: assets.id,
          assetName: assets.assetName,
          assetCode: assets.assetCode,
          quantity: assets.quantity,
          assetValue: assets.assetValue, classificationId: assets.classificationId,
          condition: assets.condition,
          assignedTo: assets.assignedTo,
          employeeName: employees.fullName,
          departmentId: assets.departmentId,
          departmentName: departments.name,
          branchId: departments.branchId,
          branchName: branches.name,
          locationId: assets.locationId,
          originLocationId: assets.originLocationId,
          locationName: locations.name,
          status: assets.status,
          draftVersion: assets.draftVersion, approvedBy: assets.approvedBy, approvedAt: assets.approvedAt,
          approvalSnapshot: assets.approvalSnapshot, reviewNote: assets.reviewNote,
          notes: assets.notes,
          assetImagePath: assets.assetImagePath,
          invoiceImagePath: assets.invoiceImagePath,
          excludedQuantity: assets.excludedQuantity, warrantyReplacedQuantity: assets.warrantyReplacedQuantity, serialNumbers: assets.serialNumbers, warrantyStartDate: assets.warrantyStartDate, warrantyEndDate: assets.warrantyEndDate,
          createdAt: assets.createdAt,
        })
        .from(assets)
        .leftJoin(employees, eq(assets.assignedTo, employees.id))
        .leftJoin(departments, eq(assets.departmentId, departments.id))
        .leftJoin(branches, eq(departments.branchId, branches.id))
        .leftJoin(locations, eq(assets.locationId, locations.id))
        .where(ctx.user.role === "employee"
          ? and(eq(assets.id, input.id), eq(assets.assignedTo, ctx.user.employeeId ?? -1), sql`${assets.status} NOT IN ('DRAFT', 'CANCELLED')`)
          : eq(assets.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الأصل غير موجود" });
      return row;
    }),

  ...inventoryLifecycle("asset"),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [result] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        totalValue: sql<string>`COALESCE(SUM(CAST(${assets.assetValue} AS DECIMAL(12,2)) * GREATEST(${assets.quantity} - ${assets.warrantyReplacedQuantity}, 0)), 0)`,
        activeCount: sql<number>`SUM(CASE WHEN ${assets.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
      })
      .from(assets)
      .where(and(sql`${assets.status} NOT IN ('DRAFT', 'CANCELLED')`, ctx.user.role === "employee" ? eq(assets.assignedTo, ctx.user.employeeId ?? -1) : undefined));
    return result;
  }),
});

// =============================================
// العهد
// =============================================
const custodyRouter = router({
  count: inventoryCount("custody"),
  list: protectedProcedure
    .input(inventoryPage)
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const where = inventoryWhere("custody", input, ctx.user);

      const rows = db
        .select({
          id: custodyItems.id,
          name: custodyItems.name,
          code: custodyItems.code,
          quantity: custodyItems.quantity,
          assetValue: custodyItems.assetValue, classificationId: custodyItems.classificationId,
          condition: custodyItems.condition,
          assignedTo: custodyItems.assignedTo,
          employeeName: employees.fullName,
          departmentId: custodyItems.departmentId,
          departmentName: departments.name,
          branchId: departments.branchId,
          branchName: branches.name,
          locationId: custodyItems.locationId,
          originLocationId: custodyItems.originLocationId,
          locationName: locations.name,
          status: custodyItems.status,
          draftVersion: custodyItems.draftVersion, approvedBy: custodyItems.approvedBy, approvedAt: custodyItems.approvedAt,
          approvalSnapshot: custodyItems.approvalSnapshot, reviewNote: custodyItems.reviewNote,
          notes: custodyItems.notes,
          assetImagePath: custodyItems.assetImagePath,
          invoiceImagePath: custodyItems.invoiceImagePath,
          excludedQuantity: custodyItems.excludedQuantity, warrantyReplacedQuantity: custodyItems.warrantyReplacedQuantity, serialNumbers: custodyItems.serialNumbers, warrantyStartDate: custodyItems.warrantyStartDate, warrantyEndDate: custodyItems.warrantyEndDate,
          createdAt: custodyItems.createdAt,
          updatedAt: custodyItems.updatedAt,
        })
        .from(custodyItems)
        .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
        .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
        .leftJoin(branches, eq(departments.branchId, branches.id))
        .leftJoin(locations, eq(custodyItems.locationId, locations.id))
        .where(where)
        .orderBy(desc(custodyItems.createdAt), desc(custodyItems.id));
      if (input?.limit) rows.limit(input.limit).offset(input.offset ?? 0);

      return await rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [row] = await db
        .select({
          id: custodyItems.id,
          name: custodyItems.name,
          code: custodyItems.code,
          quantity: custodyItems.quantity,
          assetValue: custodyItems.assetValue, classificationId: custodyItems.classificationId,
          condition: custodyItems.condition,
          assignedTo: custodyItems.assignedTo,
          employeeName: employees.fullName,
          departmentId: custodyItems.departmentId,
          departmentName: departments.name,
          branchId: departments.branchId,
          branchName: branches.name,
          locationId: custodyItems.locationId,
          originLocationId: custodyItems.originLocationId,
          locationName: locations.name,
          status: custodyItems.status,
          draftVersion: custodyItems.draftVersion, approvedBy: custodyItems.approvedBy, approvedAt: custodyItems.approvedAt,
          approvalSnapshot: custodyItems.approvalSnapshot, reviewNote: custodyItems.reviewNote,
          notes: custodyItems.notes,
          assetImagePath: custodyItems.assetImagePath,
          invoiceImagePath: custodyItems.invoiceImagePath,
          excludedQuantity: custodyItems.excludedQuantity, warrantyReplacedQuantity: custodyItems.warrantyReplacedQuantity, serialNumbers: custodyItems.serialNumbers, warrantyStartDate: custodyItems.warrantyStartDate, warrantyEndDate: custodyItems.warrantyEndDate,
          createdAt: custodyItems.createdAt,
        })
        .from(custodyItems)
        .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
        .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
        .leftJoin(branches, eq(departments.branchId, branches.id))
        .leftJoin(locations, eq(custodyItems.locationId, locations.id))
        .where(ctx.user.role === "employee"
          ? and(eq(custodyItems.id, input.id), eq(custodyItems.assignedTo, ctx.user.employeeId ?? -1), sql`${custodyItems.status} NOT IN ('DRAFT', 'CANCELLED')`)
          : eq(custodyItems.id, input.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "العهدة غير موجودة" });
      return row;
    }),

  ...inventoryLifecycle("custody"),

  stats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [result] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        totalValue: sql<string>`COALESCE(SUM(CAST(${custodyItems.assetValue} AS DECIMAL(12,2)) * GREATEST(${custodyItems.quantity} - ${custodyItems.warrantyReplacedQuantity}, 0)), 0)`,
        activeCount: sql<number>`SUM(CASE WHEN ${custodyItems.status} = 'ACTIVE' THEN 1 ELSE 0 END)`,
      })
      .from(custodyItems)
      .where(and(sql`${custodyItems.status} NOT IN ('DRAFT', 'CANCELLED')`, ctx.user.role === "employee" ? eq(custodyItems.assignedTo, ctx.user.employeeId ?? -1) : undefined));
    return result;
  }),
});

export const inventoryRouter = router({
  assets: assetsRouter,
  custody: custodyRouter,
});
