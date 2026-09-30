import { z } from "zod";
import { operatorProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  assets,
  custodyItems,
  employees,
  departments,
  branches,
  locations,
  auditLog,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { logAuditAction } from "../security";
import * as XLSX from "xlsx";

// Helper: Convert DB rows to Excel buffer
function createExcelBuffer(data: Record<string, unknown>[], headers: { key: string; label: string }[], sheetName: string): string {
  const wb = XLSX.utils.book_new();
  
  // Create header row + data rows
  const wsData = [
    headers.map(h => h.label),
    ...data.map(row => headers.map(h => {
      const val = row[h.key];
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().split("T")[0];
      return String(val);
    }))
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Set RTL for Arabic
  ws["!dir"] = "rtl";
  
  // Set column widths
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.label.length * 2, 15) }));
  
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  const buffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return buffer;
}

// Helper: Parse Excel buffer to array of objects
function parseExcelBuffer(base64Data: string, headers: { key: string; label: string; aliases?: string[] }[]): Record<string, string>[] {
  const buffer = Buffer.from(base64Data, "base64");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  
  const rawData = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
  if (rawData.length < 2) return [];
  
  // Skip header row, map data rows
  const headerRow = rawData[0] as string[];
  const results: Record<string, string>[] = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as string[];
    if (!row || row.length === 0) continue;
    
    const obj: Record<string, string> = {};
    
    // Try to match by header label first
    for (const h of headers) {
      const acceptedLabels = [h.label, ...(h.aliases ?? [])].map((label) => label.trim());
      const colIndex = headerRow.findIndex(
        (label: string) => label && acceptedLabels.includes(String(label).trim())
      );
      if (colIndex >= 0 && row[colIndex] !== undefined && row[colIndex] !== null) {
        obj[h.key] = String(row[colIndex]).trim();
      }
    }
    
    // If no match by label, use position
    if (Object.keys(obj).length === 0) {
      for (let j = 0; j < Math.min(row.length, headers.length); j++) {
        if (row[j] !== undefined && row[j] !== null) {
          obj[headers[j].key] = String(row[j]).trim();
        }
      }
    }
    
    // Skip empty rows
    if (Object.values(obj).some(v => v && v.length > 0)) {
      results.push(obj);
    }
  }
  
  return results;
}

// Column definitions for each entity
const assetHeaders = [
  { key: "assetName", label: "اسم الأصل" },
  { key: "assetCode", label: "الرمز" },
  { key: "quantity", label: "الكمية" },
  { key: "assetValue", label: "قيمة الوحدة" },
  { key: "condition", label: "الحالة" },
  { key: "employeeName", label: "المستلم" },
  { key: "departmentName", label: "القسم" },
  { key: "branchName", label: "الفرع" },
  { key: "locationName", label: "الموقع" },
  { key: "status", label: "الوضع" },
  { key: "notes", label: "ملاحظات" },
];

const custodyHeaders = [
  { key: "name", label: "اسم العهدة" },
  { key: "code", label: "الرمز" },
  { key: "quantity", label: "الكمية" },
  { key: "assetValue", label: "قيمة الوحدة" },
  { key: "condition", label: "الحالة" },
  { key: "employeeName", label: "المستلم" },
  { key: "departmentName", label: "القسم" },
  { key: "branchName", label: "الفرع" },
  { key: "locationName", label: "الموقع" },
  { key: "status", label: "الوضع" },
  { key: "notes", label: "ملاحظات" },
];

const employeeHeaders = [
  { key: "fingerprintId", label: "رقم البصمة", aliases: ["الرقم الوظيفي", "رقم وظيفي"] },
  { key: "fullName", label: "اسم الموظف", aliases: ["الاسم الكامل", "الاسم"] },
  { key: "nationalId", label: "رقم الهوية", aliases: ["رقم الهوية الوطنية", "الهوية", "رقم الإقامة"] },
];

const auditHeaders = [
  { key: "id", label: "#" },
  { key: "createdAt", label: "التاريخ" },
  { key: "actionType", label: "العملية" },
  { key: "tableName", label: "الجدول" },
  { key: "actionDescription", label: "الوصف" },
  { key: "performedByName", label: "المستخدم" },
  { key: "ipAddress", label: "عنوان IP" },
];

const reportHeaders = [
  { key: "type", label: "النوع" },
  { key: "code", label: "الرمز" },
  { key: "name", label: "الاسم" },
  { key: "quantity", label: "الكمية" },
  { key: "unitValue", label: "قيمة الوحدة" },
  { key: "totalValue", label: "إجمالي القيمة" },
  { key: "employeeName", label: "المستلم" },
  { key: "departmentName", label: "القسم" },
  { key: "branchName", label: "الفرع" },
  { key: "locationName", label: "الموقع" },
  { key: "status", label: "الحالة" },
  { key: "notes", label: "ملاحظات" },
];

export const excelRouter = router({
  // ==========================================
  // تصدير الأصول
  // ==========================================
  exportAssets: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allAssets = await db
      .select({
        assetName: assets.assetName,
        assetCode: assets.assetCode,
        quantity: assets.quantity,
        assetValue: assets.assetValue,
        condition: assets.condition,
        employeeName: employees.fullName,
        departmentName: departments.name,
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
      .orderBy(assets.id);

    const statusMap: Record<string, string> = {
      ACTIVE: "نشط",
      EXCLUDED: "مستبعد",
      TRANSFERRED: "منقول",
    };

    const data = allAssets.map(a => ({
      ...a,
      status: statusMap[a.status || ""] || a.status,
    }));

    const base64 = createExcelBuffer(data as Record<string, unknown>[], assetHeaders, "الأصول");

    await logAuditAction({
      tableName: "assets",
      actionType: "EXPORT",
      actionDescription: `تصدير ${data.length} أصل إلى Excel`,
      performedBy: ctx.user?.id,
      performedByName: ctx.user?.name || "مستخدم",
      ipAddress: ctx.req?.ip || "unknown",
    });

    return { base64, filename: `الأصول_${new Date().toISOString().split("T")[0]}.xlsx`, count: data.length };
  }),

  // ==========================================
  // استيراد الأصول
  // ==========================================
  importAssets: operatorProcedure
    .input(z.object({ base64Data: z.string(), previewOnly: z.boolean().optional().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = parseExcelBuffer(input.base64Data, assetHeaders);
      if (rows.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات صالحة");

      // Get lookup maps
      const allEmployees = await db.select().from(employees);
      const allDepts = await db.select().from(departments);
      const allBranches = await db.select().from(branches);
      const allLocs = await db.select().from(locations);


      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (!row.assetName || row.assetName.length === 0) {
            skipped++;
            continue;
          }

          const locationName = String(row.locationName || "").trim();
          const departmentName = String(row.departmentName || "").trim();
          const branchName = String(row.branchName || "").trim();
          const employeeName = String(row.employeeName || "").trim();

          const location = allLocs.find(l => String(l.name || "").trim() === locationName);
          if (!location) throw new Error(`الموقع "${locationName || "غير محدد"}" غير موجود`);

          const branch = allBranches.find(b => String(b.name || "").trim() === branchName && b.locationId === location.id);
          if (!branch) throw new Error(`الفرع "${branchName || "غير محدد"}" غير موجود أو لا يتبع الموقع "${locationName}"`);
          const department = allDepts.find(d => String(d.name || "").trim() === departmentName && d.branchId === branch.id);
          if (!department) throw new Error(`القسم "${departmentName || "غير محدد"}" غير موجود أو لا يتبع الفرع "${branchName}"`);

          // الموظف مستقل عن قسم وموقع الأصل/العهدة؛ يكفي أن يكون موجوداً في سجل الموظفين.
          const employee = allEmployees.find(e => String(e.fullName || "").trim() === employeeName);
          if (!employee) throw new Error(`الموظف "${employeeName || "غير محدد"}" غير موجود`);

          if (!input.previewOnly) await db.insert(assets).values({
            assetName: row.assetName,
            assetCode: row.assetCode || null,
            quantity: parseInt(row.quantity) || 1,
            assetValue: row.assetValue || "0",
            condition: row.condition || "جيد جدًا",
            assignedTo: employee.id,
            departmentId: department.id,
            locationId: location.id,
            status: "ACTIVE",
            notes: row.notes || null,
          });
          imported++;
        } catch (err: any) {
          errors.push(`صف ${i + 2}: ${err.message}`);
          skipped++;
        }
      }

      if (!input.previewOnly) await logAuditAction({
        tableName: "assets",
        actionType: "IMPORT",
        actionDescription: `استيراد أصول من Excel: ${imported} ناجح، ${skipped} تم تخطيه`,
        performedBy: ctx.user?.id,
        performedByName: ctx.user?.name || "مستخدم",
        ipAddress: ctx.req?.ip || "unknown",
      });

      return { imported, skipped, errors, total: rows.length, previewOnly: input.previewOnly };
    }),

  // ==========================================
  // تصدير العهد
  // ==========================================
  exportCustody: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allCustody = await db
      .select({
        name: custodyItems.name,
        code: custodyItems.code,
        quantity: custodyItems.quantity,
        assetValue: custodyItems.assetValue,
        condition: custodyItems.condition,
        employeeName: employees.fullName,
        departmentName: departments.name,
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
      .orderBy(custodyItems.id);

    const statusMap: Record<string, string> = {
      ACTIVE: "نشط",
      EXCLUDED: "مستبعد",
      TRANSFERRED: "منقول",
    };

    const data = allCustody.map(c => ({
      ...c,
      status: statusMap[c.status || ""] || c.status,
    }));

    const base64 = createExcelBuffer(data as Record<string, unknown>[], custodyHeaders, "العهد");

    await logAuditAction({
      tableName: "custody_items",
      actionType: "EXPORT",
      actionDescription: `تصدير ${data.length} عهدة إلى Excel`,
      performedBy: ctx.user?.id,
      performedByName: ctx.user?.name || "مستخدم",
      ipAddress: ctx.req?.ip || "unknown",
    });

    return { base64, filename: `العهد_${new Date().toISOString().split("T")[0]}.xlsx`, count: data.length };
  }),

  // ==========================================
  // استيراد العهد
  // ==========================================
  importCustody: operatorProcedure
    .input(z.object({ base64Data: z.string(), previewOnly: z.boolean().optional().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = parseExcelBuffer(input.base64Data, custodyHeaders);
      if (rows.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات صالحة");

      const allEmployees = await db.select().from(employees);
      const allDepts = await db.select().from(departments);
      const allBranches = await db.select().from(branches);
      const allLocs = await db.select().from(locations);


      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          if (!row.name || row.name.length === 0) {
            skipped++;
            continue;
          }

          const locationName = String(row.locationName || "").trim();
          const departmentName = String(row.departmentName || "").trim();
          const branchName = String(row.branchName || "").trim();
          const employeeName = String(row.employeeName || "").trim();

          const location = allLocs.find(l => String(l.name || "").trim() === locationName);
          if (!location) throw new Error(`الموقع "${locationName || "غير محدد"}" غير موجود`);

          const branch = allBranches.find(b => String(b.name || "").trim() === branchName && b.locationId === location.id);
          if (!branch) throw new Error(`الفرع "${branchName || "غير محدد"}" غير موجود أو لا يتبع الموقع "${locationName}"`);
          const department = allDepts.find(d => String(d.name || "").trim() === departmentName && d.branchId === branch.id);
          if (!department) throw new Error(`القسم "${departmentName || "غير محدد"}" غير موجود أو لا يتبع الفرع "${branchName}"`);

          // الموظف مستقل عن قسم وموقع الأصل/العهدة؛ يكفي أن يكون موجوداً في سجل الموظفين.
          const employee = allEmployees.find(e => String(e.fullName || "").trim() === employeeName);
          if (!employee) throw new Error(`الموظف "${employeeName || "غير محدد"}" غير موجود`);

          if (!input.previewOnly) await db.insert(custodyItems).values({
            name: row.name,
            code: row.code || null,
            quantity: parseInt(row.quantity) || 1,
            assetValue: row.assetValue || "0",
            condition: row.condition || "جيد جدًا",
            assignedTo: employee.id,
            departmentId: department.id,
            locationId: location.id,
            status: "ACTIVE",
            notes: row.notes || null,
          });
          imported++;
        } catch (err: any) {
          errors.push(`صف ${i + 2}: ${err.message}`);
          skipped++;
        }
      }

      if (!input.previewOnly) await logAuditAction({
        tableName: "custody_items",
        actionType: "IMPORT",
        actionDescription: `استيراد عهد من Excel: ${imported} ناجح، ${skipped} تم تخطيه`,
        performedBy: ctx.user?.id,
        performedByName: ctx.user?.name || "مستخدم",
        ipAddress: ctx.req?.ip || "unknown",
      });

      return { imported, skipped, errors, total: rows.length, previewOnly: input.previewOnly };
    }),

  // ==========================================
  // تصدير الموظفين
  // ==========================================
  exportEmployees: operatorProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const allEmployees = await db.select({
      fullName: employees.fullName,
      departmentName: departments.name,
      locationName: locations.name,
      fingerprintId: employees.fingerprintId,
      nationalId: employees.nationalId,
      phone: employees.phone,
    }).from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(locations, eq(departments.locationId, locations.id))
      .orderBy(employees.id);

    const data = allEmployees;

    const base64 = createExcelBuffer(data as Record<string, unknown>[], employeeHeaders, "الموظفين");

    await logAuditAction({
      tableName: "employees",
      actionType: "EXPORT",
      actionDescription: `تصدير ${data.length} موظف إلى Excel`,
      performedBy: ctx.user?.id,
      performedByName: ctx.user?.name || "مستخدم",
      ipAddress: ctx.req?.ip || "unknown",
    });

    return { base64, filename: `الموظفين_${new Date().toISOString().split("T")[0]}.xlsx`, count: data.length };
  }),

  // ==========================================
  // استيراد الموظفين
  // ==========================================
  importEmployees: operatorProcedure
    .input(z.object({ base64Data: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = parseExcelBuffer(input.base64Data, employeeHeaders);
      if (rows.length === 0) throw new Error("الملف فارغ أو لا يحتوي على بيانات صالحة");

      // الاستيراد الأولي للموظفين لا يتطلب قسماً أو موقعاً.
      // يتم ربط الموظف بالقسم يدوياً لاحقاً من شاشة الإعدادات.
      const existingEmployees = await db
        .select({
          id: employees.id,
          fingerprintId: employees.fingerprintId,
        })
        .from(employees);
      const employeesByFingerprint = new Map(
        existingEmployees
          .filter((employee) => Boolean(employee.fingerprintId?.trim()))
          .map((employee) => [employee.fingerprintId!.trim(), employee])
      );

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          const fullName = row.fullName?.trim();
          const fingerprintId = row.fingerprintId?.trim();
          const nationalId = row.nationalId?.trim() || null;

          if (!fingerprintId) throw new Error("رقم البصمة / الرقم الوظيفي مطلوب");

          const existingEmployee = employeesByFingerprint.get(fingerprintId);
          if (existingEmployee) {
            if (!nationalId) throw new Error("رقم الهوية مطلوب لتحديث الموظف الموجود");

            // الموظف موجود مسبقاً: نحدّث رقم الهوية فقط، دون المساس
            // بالاسم أو القسم أو الهاتف أو أي بيانات أخرى.
            await db
              .update(employees)
              .set({ nationalId })
              .where(eq(employees.id, existingEmployee.id));
            updated++;
            continue;
          }

          if (!fullName) throw new Error("اسم الموظف مطلوب للموظف الجديد");

          await db.insert(employees).values({
            fullName,
            fingerprintId,
            departmentId: null,
            nationalId,
            phone: null,
          });
          imported++;
        } catch (err: any) {
          errors.push(`صف ${i + 2}: ${err.message}`);
          skipped++;
        }
      }

      await logAuditAction({
        tableName: "employees",
        actionType: "IMPORT",
        actionDescription: `استيراد موظفين من Excel: ${imported} جديد، ${updated} تم تحديثه، ${skipped} تم تخطيه`,
        performedBy: ctx.user?.id,
        performedByName: ctx.user?.name || "مستخدم",
        ipAddress: ctx.req?.ip || "unknown",
      });

      return { imported, updated, skipped, errors, total: rows.length };
    }),

  // ==========================================
  // تصدير التقارير
  // ==========================================
  exportReport: operatorProcedure
    .input(z.object({
      reportType: z.enum(["all", "assets", "custody"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const items: Record<string, unknown>[] = [];

      if (input.reportType !== "custody") {
        const allAssets = await db
          .select({
            assetName: assets.assetName,
            assetCode: assets.assetCode,
            quantity: assets.quantity,
            assetValue: assets.assetValue,
            employeeName: employees.fullName,
            departmentName: departments.name,
            branchName: branches.name,
            locationName: locations.name,
            status: assets.status,
            notes: assets.notes,
          })
          .from(assets)
          .leftJoin(employees, eq(assets.assignedTo, employees.id))
          .leftJoin(departments, eq(assets.departmentId, departments.id))
          .leftJoin(branches, eq(departments.branchId, branches.id))
          .leftJoin(locations, eq(assets.locationId, locations.id));

        for (const a of allAssets) {
          items.push({
            type: "أصل",
            code: a.assetCode || "",
            name: a.assetName,
            quantity: String(a.quantity),
            unitValue: a.assetValue || "0",
            totalValue: String(Number(a.assetValue || 0) * (a.quantity || 1)),
            employeeName: a.employeeName || "",
            departmentName: a.departmentName || "",
            branchName: a.branchName || "",
            locationName: a.locationName || "",
            status: a.status === "ACTIVE" ? "نشط" : a.status === "EXCLUDED" ? "مستبعد" : a.status,
            notes: a.notes || "",
          });
        }
      }

      if (input.reportType !== "assets") {
        const allCustody = await db
          .select({
            name: custodyItems.name,
            code: custodyItems.code,
            quantity: custodyItems.quantity,
            assetValue: custodyItems.assetValue,
            employeeName: employees.fullName,
            departmentName: departments.name,
            branchName: branches.name,
            locationName: locations.name,
            status: custodyItems.status,
            notes: custodyItems.notes,
          })
          .from(custodyItems)
          .leftJoin(employees, eq(custodyItems.assignedTo, employees.id))
          .leftJoin(departments, eq(custodyItems.departmentId, departments.id))
          .leftJoin(branches, eq(departments.branchId, branches.id))
          .leftJoin(locations, eq(custodyItems.locationId, locations.id));

        for (const c of allCustody) {
          items.push({
            type: "عهدة",
            code: c.code || "",
            name: c.name,
            quantity: String(c.quantity),
            unitValue: c.assetValue || "0",
            totalValue: String(Number(c.assetValue || 0) * (c.quantity || 1)),
            employeeName: c.employeeName || "",
            departmentName: c.departmentName || "",
            branchName: c.branchName || "",
            locationName: c.locationName || "",
            status: c.status === "ACTIVE" ? "نشط" : c.status === "EXCLUDED" ? "مستبعد" : c.status,
            notes: c.notes || "",
          });
        }
      }

      const typeLabel = input.reportType === "all" ? "الكل" : input.reportType === "assets" ? "الأصول" : "العهد";
      const base64 = createExcelBuffer(items, reportHeaders, `تقرير ${typeLabel}`);

      await logAuditAction({
        tableName: "reports",
        actionType: "EXPORT",
        actionDescription: `تصدير تقرير (${typeLabel}) إلى Excel - ${items.length} عنصر`,
        performedBy: ctx.user?.id,
        performedByName: ctx.user?.name || "مستخدم",
        ipAddress: ctx.req?.ip || "unknown",
      });

      return { base64, filename: `تقرير_${typeLabel}_${new Date().toISOString().split("T")[0]}.xlsx`, count: items.length };
    }),

  // ==========================================
  // تصدير سجل التدقيق
  // ==========================================
  exportAuditLog: operatorProcedure
    .input(z.object({
      tableName: z.string().optional(),
      actionType: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];
      if (input.tableName) conditions.push(eq(auditLog.tableName, input.tableName));
      if (input.actionType) conditions.push(eq(auditLog.actionType, input.actionType));
      if (input.dateFrom) conditions.push(gte(auditLog.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(auditLog.createdAt, new Date(input.dateTo + "T23:59:59")));

      const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt));
      const logs = conditions.length > 0
        ? await query.where(and(...conditions))
        : await query;

      const data = logs.map(l => ({
        id: String(l.id),
        createdAt: l.createdAt ? new Date(l.createdAt).toLocaleString("ar-SA") : "",
        actionType: l.actionType,
        tableName: l.tableName,
        actionDescription: l.actionDescription || "",
        performedByName: l.performedByName || "",
        ipAddress: l.ipAddress || "",
      }));

      const base64 = createExcelBuffer(data as Record<string, unknown>[], auditHeaders, "سجل التدقيق");

      return { base64, filename: `سجل_التدقيق_${new Date().toISOString().split("T")[0]}.xlsx`, count: data.length };
    }),

  // ==========================================
  // تحميل قالب Excel فارغ
  // ==========================================
  downloadTemplate: operatorProcedure
    .input(z.object({ type: z.enum(["assets", "custody", "employees"]) }))
    .mutation(async ({ input }) => {
      const headersMap = {
        assets: { headers: assetHeaders, sheet: "الأصول", filename: "قالب_الأصول.xlsx" },
        custody: { headers: custodyHeaders, sheet: "العهد", filename: "قالب_العهد.xlsx" },
        employees: { headers: employeeHeaders, sheet: "الموظفين", filename: "قالب_الموظفين.xlsx" },
      };

      const config = headersMap[input.type];
      
      // Create template with sample row
      const sampleData: Record<string, unknown>[] = [];
      if (input.type === "assets") {
        sampleData.push({
          assetName: "مثال: جهاز حاسب",
          assetCode: "AST-001",
          quantity: "1",
          assetValue: "5000",
          condition: "جيد جدًا",
          employeeName: "اسم الموظف",
          departmentName: "اسم القسم",
          branchName: "اسم الفرع",
          locationName: "اسم الموقع",
          status: "نشط",
          notes: "",
        });
      } else if (input.type === "custody") {
        sampleData.push({
          name: "مثال: طابعة",
          code: "CUS-001",
          quantity: "1",
          assetValue: "2000",
          condition: "جيد جدًا",
          employeeName: "اسم الموظف",
          departmentName: "اسم القسم",
          branchName: "اسم الفرع",
          locationName: "اسم الموقع",
          status: "نشط",
          notes: "",
        });
      } else {
        sampleData.push({
          fingerprintId: "1001",
          fullName: "مثال: أحمد محمد",
          nationalId: "1098765432",
        });
      }

      const base64 = createExcelBuffer(sampleData, config.headers, config.sheet);
      return { base64, filename: config.filename };
    }),
});
