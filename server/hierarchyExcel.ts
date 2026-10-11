import { z } from "zod";
import { readExcelRows } from "./excelInput";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { operatorProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  locations,
  branches,
  departments,
  appSettings,
  auditLog,
} from "../drizzle/schema";
import { createExcelBuffer } from "./excelUtils";
import { createHierarchyRecord } from "./hierarchyCreation";
import { normalizeNumberPrefix, isValidNumberPrefix } from "./numbering";

const typeSchema = z.enum(["locations", "branches", "departments"]);
type Kind = z.infer<typeof typeSchema>;
type Column = { key: string; label: string };
const specs: Record<
  Kind,
  { label: string; columns: Column[]; sample: Record<string, string> }
> = {
  locations: {
    label: "المواقع",
    columns: [
      { key: "name", label: "اسم الموقع" },
      { key: "assetPrefix", label: "بادئة الأصول" },
      { key: "custodyPrefix", label: "بادئة العهد" },
    ],
    sample: {
      name: "مثال: موقع جديد",
      assetPrefix: "NEW-AST",
      custodyPrefix: "NEW-CUS",
    },
  },
  branches: {
    label: "الفروع",
    columns: [
      { key: "name", label: "اسم الفرع" },
      { key: "locationCode", label: "كود الموقع" },
      { key: "locationName", label: "اسم الموقع" },
    ],
    sample: {
      name: "مثال: فرع جديد",
      locationCode: "01",
      locationName: "اسم الموقع الموجود",
    },
  },
  departments: {
    label: "الأقسام",
    columns: [
      { key: "name", label: "اسم القسم" },
      { key: "branchCode", label: "كود الفرع" },
      { key: "branchName", label: "اسم الفرع" },
      { key: "locationCode", label: "كود الموقع" },
      { key: "locationName", label: "اسم الموقع" },
    ],
    sample: {
      name: "مثال: قسم جديد",
      branchCode: "01-01",
      branchName: "اسم الفرع الموجود",
      locationCode: "01",
      locationName: "اسم الموقع الموجود",
    },
  },
};
const key = (value: unknown) =>
  String(value ?? "")
    .trim()
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("ar");
async function parseRows(base64: string, type: Kind) {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 10 * 1024 * 1024)
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "الملف يتجاوز 10 ميجابايت",
    });
  const raw = await readExcelRows(base64,true);
  const headers = (raw[0] || []).map(value => String(value).trim());
  const columns = [...specs[type].columns, { key: "code", label: "الكود" }];
  if (!headers.includes(specs[type].columns[0].label))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `عمود «${specs[type].columns[0].label}» مطلوب؛ استخدم القالب الخاص بالتبويب`,
    });
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "عناوين الأعمدة مكررة",
    });
  const rows = raw
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      data: Object.fromEntries(
        columns.map(column => [
          column.key,
          String(row[headers.indexOf(column.label)] ?? "").trim(),
        ])
      ),
    }))
    .filter(row => Object.values(row.data).some(Boolean));
  if (!rows.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "لا توجد صفوف بيانات في الملف",
    });
  if (rows.length > 1000)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "الحد الأقصى 1000 صف في الملف الواحد",
    });
  return rows;
}
async function database() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  return db;
}
async function tables(db: any, lock = false) {
  const query = (table: any) => {
    const select = db.select().from(table);
    return lock ? select.for("update") : select;
  };
  const ls = await query(locations),
    bs = await query(branches),
    ds = await query(departments);
  return {
    locations: ls as any[],
    branches: bs as any[],
    departments: ds as any[],
  };
}
function reference(rows: any[], code: string, name: string, label: string) {
  if (!code && !name) throw new Error(`حدد كود ${label} أو اسمه`);
  const matches = code
    ? rows.filter(row => row.code === code)
    : rows.filter(row => key(row.name) === key(name));
  if (!matches.length)
    throw new Error(
      `${label} غير موجود؛ استورد المستوى الأعلى أولًا وتحقق من الكود`
    );
  if (matches.length !== 1)
    throw new Error(`اسم ${label} مكرر؛ استخدم الكود لتحديده`);
  if (name && key(matches[0].name) !== key(name))
    throw new Error(`اسم ${label} لا يطابق الكود`);
  if (!matches[0].code) throw new Error(`${label} لا يملك كودًا هرميًا`);
  return matches[0];
}
function validateRow(
  data: Record<string, string>,
  type: Kind,
  state: Awaited<ReturnType<typeof tables>>
) {
  if (!data.name || data.name.length > 255)
    throw new Error("الاسم مطلوب بحد أقصى 255 حرفًا");
  let parent: any = null;
  if (type === "branches")
    parent = reference(
      state.locations,
      data.locationCode,
      data.locationName,
      "الموقع"
    );
  if (type === "departments") {
    const location =
      data.locationCode || data.locationName
        ? reference(
            state.locations,
            data.locationCode,
            data.locationName,
            "الموقع"
          )
        : null;
    parent = reference(
      location
        ? state.branches.filter(branch => branch.locationId === location.id)
        : state.branches,
      data.branchCode,
      data.branchName,
      "الفرع"
    );
  }
  const existing = state[type].filter(
    row =>
      key(row.name) === key(data.name) &&
      (type === "locations" ||
        (type === "branches"
          ? row.locationId === parent.id
          : row.branchId === parent.id))
  );
  if (data.code) {
    const coded = state[type].find(row => row.code === data.code);
    if (!coded || !existing.some(row => row.id === coded.id))
      throw new Error(
        "الكود في التصدير مرجعي فقط؛ لا يمكن تعديل سجل موجود أو فرض كود لسجل جديد عبر الاستيراد"
      );
  }
  if (existing.length) return { existing: true, input: null, parent };
  const input = {
    name: data.name,
    locationId: type === "branches" ? parent.id : undefined,
    branchId: type === "departments" ? parent.id : undefined,
    assetPrefix:
      type === "locations"
        ? normalizeNumberPrefix(data.assetPrefix)
        : undefined,
    custodyPrefix:
      type === "locations"
        ? normalizeNumberPrefix(data.custodyPrefix)
        : undefined,
  };
  if (type === "locations")
    for (const field of ["assetPrefix", "custodyPrefix"] as const) {
      const prefix = input[field];
      if (prefix && (prefix.length > 40 || !isValidNumberPrefix(prefix)))
        throw new Error(
          `${field === "assetPrefix" ? "بادئة الأصول" : "بادئة العهد"} غير صالحة؛ استخدم أحرفًا وأرقامًا وشرطات بحد أقصى 40 حرفًا`
        );
      if (prefix && state.locations.some(row => row[field] === prefix))
        throw new Error(`البادئة ${prefix} مستخدمة في موقع آخر`);
    }
  return { existing: false, input, parent };
}
async function audit(
  tx: any,
  ctx: any,
  type: Kind,
  actionType: string,
  recordId: number | null,
  data: any,
  description: string
) {
  await tx
    .insert(auditLog)
    .values({
      tableName: type,
      recordId,
      actionType,
      actionDescription: description,
      newData: data,
      performedBy: ctx.user.id,
      performedByName: ctx.user.name,
      ipAddress: ctx.req.ip || null,
      userAgent: ctx.req.headers["user-agent"] || null,
    });
}

export const hierarchyExcelProcedures = {
  hierarchyTemplate: operatorProcedure
    .input(z.object({ type: typeSchema }))
    .mutation(({ input }) => {
      const spec = specs[input.type];
      const base64 = createExcelBuffer([spec.sample], spec.columns, spec.label);
      return { base64, filename: `قالب_${spec.label}.xlsx` };
    }),
  exportHierarchy: operatorProcedure
    .input(z.object({ type: typeSchema }))
    .mutation(async ({ input, ctx }) => {
      const db = await database(),
        state = await tables(db),
        spec = specs[input.type];
      const data = state[input.type]
        .sort((a, b) =>
          String(a.code || "").localeCompare(String(b.code || ""))
        )
        .map(row => {
          const branch =
            input.type === "departments"
              ? state.branches.find(branch => branch.id === row.branchId)
              : null;
          const location = state.locations.find(
            location =>
              location.id ===
              (input.type === "departments"
                ? branch?.locationId
                : row.locationId)
          );
          return {
            ...row,
            locationCode: location?.code || "",
            locationName: location?.name || "",
            branchCode: branch?.code || "",
            branchName: branch?.name || "",
          };
        });
      const base64 = createExcelBuffer(
        data,
        [{ key: "code", label: "الكود" }, ...spec.columns],
        spec.label
      );
      await db.transaction(tx =>
        audit(
          tx,
          ctx,
          input.type,
          "EXPORT",
          null,
          { count: data.length },
          `تصدير ${spec.label} إلى Excel: ${data.length} سجل`
        )
      );
      return {
        base64,
        count: data.length,
        filename: `${spec.label}_${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date())}.xlsx`,
      };
    }),
  importHierarchy: operatorProcedure
    .input(
      z.object({
        type: typeSchema,
        base64Data: z
          .string()
          .min(1)
          .max(15 * 1024 * 1024),
        previewOnly: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rows = await parseRows(input.base64Data, input.type),
        db = await database();
      const process = async (
        executor: any,
        state: Awaited<ReturnType<typeof tables>>
      ) => {
        const results: Array<{
          rowNumber: number;
          name: string;
          status: "accepted" | "existing" | "error";
          message: string;
        }> = [];
        let imported = 0,
          existing = 0,
          rejected = 0;
        for (const row of rows) {
          let validated: ReturnType<typeof validateRow>;
          try {
            validated = validateRow(row.data, input.type, state);
          } catch (error: any) {
            rejected++;
            results.push({
              rowNumber: row.rowNumber,
              name: row.data.name,
              status: "error",
              message: error.message,
            });
            continue;
          }
          if (validated.existing) {
            existing++;
            results.push({
              rowNumber: row.rowNumber,
              name: row.data.name,
              status: "existing",
              message:
                "موجود بالفعل أو مكرر في الملف؛ لن يُعدل أو يُضاف مرة أخرى",
            });
            continue;
          }
          const created = input.previewOnly
            ? { ...validated.input, id: -(imported + 1) }
            : await createHierarchyRecord(
                executor,
                input.type,
                validated.input!
              );
          state[input.type].push(created);
          if (!input.previewOnly)
            await audit(
              executor,
              ctx,
              input.type,
              "CREATE",
              created.id,
              created,
              `استيراد ${specs[input.type].label}: ${created.name} (${(created as any).code})`
            );
          imported++;
          results.push({
            rowNumber: row.rowNumber,
            name: row.data.name,
            status: "accepted",
            message: input.previewOnly
              ? "جاهز للإضافة؛ الكود يُولد عند التنفيذ"
              : `أُضيف بالكود ${(created as any).code}`,
          });
        }
        const result = {
          imported,
          existing,
          rejected,
          total: rows.length,
          previewOnly: input.previewOnly,
          results,
        };
        if (!input.previewOnly)
          await audit(
            executor,
            ctx,
            input.type,
            "IMPORT",
            null,
            result,
            `استيراد ${specs[input.type].label}: ${imported} جديد، ${existing} موجود، ${rejected} مرفوض`
          );
        return result;
      };
      if (input.previewOnly) return process(db, await tables(db));
      return db.transaction(async tx => {
        // Serialize hierarchy batches and manual location numbering, then lock existing parents before resolving references.
        await tx
          .insert(appSettings)
          .values({ id: 1 })
          .onDuplicateKeyUpdate({ set: { id: 1 } });
        await tx
          .select()
          .from(appSettings)
          .where(eq(appSettings.id, 1))
          .limit(1)
          .for("update");
        return process(tx, await tables(tx, true));
      });
    }),
};
