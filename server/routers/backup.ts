import { z } from "zod";
import { ownerProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { auditLog } from "../../drizzle/schema";
import { logAuditAction } from "../security";
import { storagePut } from "../storage";
import { desc, sql } from "drizzle-orm";

const BACKUP_VERSION = "2.0";
const MIGRATIONS_TABLE = "__drizzle_migrations";

type ColumnMeta = {
  name: string;
  dataType: string;
  columnType: string;
  nullable: boolean;
  key: string;
  extra: string;
  ordinalPosition: number;
};

type ForeignKeyMeta = {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  constraintName: string;
};

type DatabaseSchemaSnapshot = {
  tableNames: string[];
  columns: Record<string, ColumnMeta[]>;
  foreignKeys: ForeignKeyMeta[];
};

/**
 * mysql2/Drizzle قد يعيد نتيجة execute بصيغ مختلفة حسب الإصدار.
 * هذه الدالة تستخرج صفوف SELECT بشكل موحد.
 */
function extractRawRows(result: any): any[] {
  if (!result) return [];

  if (Array.isArray(result)) {
    // mysql2: [rows, fields]
    if (Array.isArray(result[0])) return result[0];

    // بعض إصدارات Drizzle تعيد الصفوف مباشرة.
    if (result.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return result;
    }
  }

  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

/** أسماء الجداول والأعمدة تأتي من information_schema، ومع ذلك نتحقق منها قبل وضعها في SQL. */
function identifier(name: string) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`اسم SQL غير صالح: ${name}`);
  }
  return sql.raw(`\`${name}\``);
}

function getField(row: any, ...names: string[]): any {
  for (const name of names) {
    if (row?.[name] !== undefined) return row[name];
  }
  return undefined;
}

/** قراءة هيكل القاعدة الفعلي من TiDB بدلاً من الاعتماد على schema.ts فقط. */
async function readDatabaseSchema(executor: any): Promise<DatabaseSchemaSnapshot> {
  const tableResult = await executor.execute(sql`
    SELECT TABLE_NAME AS tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  const tableRows = extractRawRows(tableResult);
  const tableNames = tableRows
    .map((row) => String(getField(row, "tableName", "TABLE_NAME") ?? ""))
    .filter(Boolean);

  const columnResult = await executor.execute(sql`
    SELECT
      TABLE_NAME AS tableName,
      COLUMN_NAME AS columnName,
      DATA_TYPE AS dataType,
      COLUMN_TYPE AS columnType,
      IS_NULLABLE AS isNullable,
      COLUMN_KEY AS columnKey,
      EXTRA AS extra,
      ORDINAL_POSITION AS ordinalPosition
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  const columnRows = extractRawRows(columnResult);
  const columns: Record<string, ColumnMeta[]> = {};

  for (const row of columnRows) {
    const tableName = String(getField(row, "tableName", "TABLE_NAME") ?? "");
    const columnName = String(getField(row, "columnName", "COLUMN_NAME") ?? "");
    if (!tableName || !columnName) continue;

    if (!columns[tableName]) columns[tableName] = [];
    columns[tableName].push({
      name: columnName,
      dataType: String(getField(row, "dataType", "DATA_TYPE") ?? "").toLowerCase(),
      columnType: String(getField(row, "columnType", "COLUMN_TYPE") ?? ""),
      nullable: String(getField(row, "isNullable", "IS_NULLABLE") ?? "YES") === "YES",
      key: String(getField(row, "columnKey", "COLUMN_KEY") ?? ""),
      extra: String(getField(row, "extra", "EXTRA") ?? ""),
      ordinalPosition: Number(getField(row, "ordinalPosition", "ORDINAL_POSITION") ?? 0),
    });
  }

  const fkResult = await executor.execute(sql`
    SELECT
      TABLE_NAME AS childTable,
      COLUMN_NAME AS childColumn,
      REFERENCED_TABLE_NAME AS parentTable,
      REFERENCED_COLUMN_NAME AS parentColumn,
      CONSTRAINT_NAME AS constraintName
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
  `);
  const fkRows = extractRawRows(fkResult);
  const foreignKeys: ForeignKeyMeta[] = fkRows
    .map((row) => ({
      childTable: String(getField(row, "childTable", "TABLE_NAME") ?? ""),
      childColumn: String(getField(row, "childColumn", "COLUMN_NAME") ?? ""),
      parentTable: String(getField(row, "parentTable", "REFERENCED_TABLE_NAME") ?? ""),
      parentColumn: String(getField(row, "parentColumn", "REFERENCED_COLUMN_NAME") ?? ""),
      constraintName: String(getField(row, "constraintName", "CONSTRAINT_NAME") ?? ""),
    }))
    .filter((fk) => fk.childTable && fk.parentTable);

  return { tableNames, columns, foreignKeys };
}

/** قراءة جميع أعمدة جدول فعلياً من TiDB. */
async function selectAllRows(executor: any, tableName: string): Promise<any[]> {
  const result = await executor.execute(sql`SELECT * FROM ${identifier(tableName)}`);
  return extractRawRows(result);
}

/**
 * حساب ترتيب الإدخال من العلاقات الفعلية: الآباء أولاً ثم الأبناء.
 * ترتيب الحذف هو عكس هذه النتيجة.
 */
function buildInsertOrder(tableNames: string[], foreignKeys: ForeignKeyMeta[]): string[] {
  const tableSet = new Set(tableNames);
  const indegree = new Map<string, number>();
  const children = new Map<string, Set<string>>();

  for (const table of tableNames) {
    indegree.set(table, 0);
    children.set(table, new Set());
  }

  for (const fk of foreignKeys) {
    if (!tableSet.has(fk.childTable) || !tableSet.has(fk.parentTable)) continue;
    if (fk.childTable === fk.parentTable) continue;

    const parentChildren = children.get(fk.parentTable)!;
    if (!parentChildren.has(fk.childTable)) {
      parentChildren.add(fk.childTable);
      indegree.set(fk.childTable, (indegree.get(fk.childTable) ?? 0) + 1);
    }
  }

  const queue = tableNames.filter((table) => (indegree.get(table) ?? 0) === 0).sort();
  const ordered: string[] = [];

  while (queue.length > 0) {
    const table = queue.shift()!;
    ordered.push(table);

    for (const child of children.get(table) ?? []) {
      const next = (indegree.get(child) ?? 0) - 1;
      indegree.set(child, next);
      if (next === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  if (ordered.length !== tableNames.length) {
    const unresolved = tableNames.filter((table) => !ordered.includes(table));
    throw new Error(`تعذر تحديد ترتيب آمن للعلاقات بين الجداول: ${unresolved.join(", ")}`);
  }

  return ordered;
}

/** تجهيز القيمة للإدخال الخام اعتماداً على نوع العمود الحقيقي في TiDB. */
function prepareValue(value: any, column: ColumnMeta): any {
  if (value === null || value === undefined) return null;

  if (column.dataType === "json") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  if (column.dataType === "timestamp" || column.dataType === "datetime") {
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`قيمة تاريخ غير صالحة للعمود ${column.name}`);
    }
    return parsed;
  }

  if (column.dataType === "date") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    return text.includes("T") ? text.slice(0, 10) : text;
  }

  // BIGINT قد يصل كسلسلة نصية، وmysql2 يستطيع إدخاله بأمان بهذه الصورة.
  if (column.dataType === "bigint" && typeof value === "bigint") {
    return value.toString();
  }

  return value;
}

/** إدخال كامل الصفوف باستخدام أسماء الأعمدة الحقيقية، على دفعات ومع معاملات SQL آمنة. */
async function insertRawRows(
  tx: any,
  tableName: string,
  rows: any[],
  columns: ColumnMeta[]
): Promise<number> {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  if (!columns.length) throw new Error(`لا توجد معلومات أعمدة للجدول ${tableName}`);

  const BATCH_SIZE = 100;
  const columnSql = sql.join(columns.map((column) => identifier(column.name)), sql.raw(", "));

  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);

    const valueTuples = batch.map((row, rowIndex) => {
      const values = columns.map((column) => {
        if (!Object.prototype.hasOwnProperty.call(row, column.name)) {
          throw new Error(
            `النسخة لا تحتوي العمود ${tableName}.${column.name} في السجل رقم ${offset + rowIndex + 1}`
          );
        }
        return sql`${prepareValue(row[column.name], column)}`;
      });
      return sql`(${sql.join(values, sql.raw(", "))})`;
    });

    await tx.execute(sql`
      INSERT INTO ${identifier(tableName)} (${columnSql})
      VALUES ${sql.join(valueTuples, sql.raw(", "))}
    `);

    inserted += batch.length;
  }

  return inserted;
}

function normalizeColumnSignature(columns: ColumnMeta[]): string[] {
  return columns
    .slice()
    .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
    .map((column) => `${column.name}:${column.columnType}`);
}

/** التأكد أن بنية الجداول في ملف النسخة تطابق القاعدة الحالية قبل حذف أي بيانات. */
function validateBackupSchema(
  backupSchema: DatabaseSchemaSnapshot,
  currentSchema: DatabaseSchemaSnapshot
) {
  const backupTables = [...backupSchema.tableNames].sort();
  const currentTables = [...currentSchema.tableNames].sort();

  if (backupTables.join("|") !== currentTables.join("|")) {
    const missingFromBackup = currentTables.filter((name) => !backupTables.includes(name));
    const missingFromDatabase = backupTables.filter((name) => !currentTables.includes(name));
    const details = [
      missingFromBackup.length ? `غير موجودة في النسخة: ${missingFromBackup.join(", ")}` : "",
      missingFromDatabase.length ? `غير موجودة في القاعدة الحالية: ${missingFromDatabase.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    throw new Error(`هيكل الجداول لا يطابق النسخة الاحتياطية. ${details}`);
  }

  for (const tableName of currentTables) {
    // جدول migrations محفوظ للمراجعة ولا تتم استعادته، لذلك لا نحتاج تطابق أعمدته للاستعادة.
    if (tableName === MIGRATIONS_TABLE) continue;

    const backupColumns = normalizeColumnSignature(backupSchema.columns[tableName] ?? []);
    const currentColumns = normalizeColumnSignature(currentSchema.columns[tableName] ?? []);

    if (backupColumns.join("|") !== currentColumns.join("|")) {
      throw new Error(
        `بنية الجدول ${tableName} تختلف عن النسخة الاحتياطية. يجب استخدام نسخة مطابقة لإصدار قاعدة البيانات الحالي.`
      );
    }
  }
}

/**
 * الواجهة ترسل الملف Base64، ومحتوى ملف .tln نفسه Base64 لـ JSON.
 * ندعم فك JSON المباشر فقط لاكتشاف الملفات القديمة وإظهار رسالة واضحة.
 */
function parseBackupFile(base64Data: string): any {
  try {
    const uploadedContent = Buffer.from(base64Data, "base64").toString("utf-8");

    try {
      return JSON.parse(uploadedContent);
    } catch {
      const decoded = Buffer.from(uploadedContent, "base64").toString("utf-8");
      return JSON.parse(decoded);
    }
  } catch {
    throw new Error("الملف غير صالح. يرجى اختيار ملف نسخة احتياطية صحيح (.tln)");
  }
}

export const backupRouter = router({
  // ==========================================
  // إنشاء نسخة احتياطية كاملة من القاعدة الفعلية
  // ==========================================
  create: ownerProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متوفرة");

    const schemaSnapshot = await readDatabaseSchema(db);
    if (!schemaSnapshot.tableNames.length) {
      throw new Error("لم يتم العثور على جداول في قاعدة البيانات");
    }

    // قراءة كل الجداول الفعلية داخل Transaction واحدة للحصول على لقطة متناسقة قدر الإمكان.
    const tables = await db.transaction(async (tx) => {
      const result: Record<string, any[]> = {};
      for (const tableName of schemaSnapshot.tableNames) {
        result[tableName] = await selectAllRows(tx, tableName);
      }
      return result;
    });

    const stats = Object.fromEntries(
      schemaSnapshot.tableNames.map((tableName) => [tableName, tables[tableName]?.length ?? 0])
    ) as Record<string, number>;

    const backupData = {
      version: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      createdBy: ctx.user?.name || "مستخدم",
      metadata: {
        fullDatabaseBackup: true,
        tableCount: schemaSnapshot.tableNames.length,
        migrationTable: {
          name: MIGRATIONS_TABLE,
          includedInBackup: schemaSnapshot.tableNames.includes(MIGRATIONS_TABLE),
          restoredAutomatically: false,
          reason: "يتم حفظ سجل migrations داخل النسخة للمراجعة فقط، ولا يُستبدل أثناء الاستعادة العادية.",
        },
      },
      schema: schemaSnapshot,
      tables,
      stats,
    };

    // Base64 لإبقاء صيغة .tln الحالية. هذا ترميز وليس تشفيراً أمنياً.
    const jsonStr = JSON.stringify(backupData, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    );
    const encodedContent = Buffer.from(jsonStr, "utf-8").toString("base64");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `backup-${timestamp}.tln`;
    const fileKey = `backups/${fileName}`;

    const { url } = await storagePut(fileKey, encodedContent, "application/octet-stream");

    await logAuditAction({
      tableName: "backup",
      actionType: "CREATE",
      actionDescription: `إنشاء نسخة احتياطية كاملة: ${fileName}`,
      newData: {
        version: BACKUP_VERSION,
        fileName,
        fileKey,
        url,
        stats,
        tableCount: schemaSnapshot.tableNames.length,
      },
      performedBy: ctx.user?.id,
      performedByName: ctx.user?.name || "مستخدم",
      ipAddress: ctx.req?.ip || "unknown",
    });

    const totalRecords = Object.values(stats).reduce((a, b) => a + b, 0);

    return {
      success: true,
      fileName,
      url,
      stats,
      totalRecords,
      createdAt: backupData.createdAt,
      version: BACKUP_VERSION,
      tableCount: schemaSnapshot.tableNames.length,
    };
  }),

  // ==========================================
  // استعادة نسخة احتياطية كاملة
  // ==========================================
  restore: ownerProcedure
    .input(z.object({ base64Data: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("قاعدة البيانات غير متوفرة");

      const backupData = parseBackupFile(input.base64Data);

      if (!backupData?.version || !backupData?.tables) {
        throw new Error("تنسيق النسخة الاحتياطية غير صحيح");
      }

      if (backupData.version !== BACKUP_VERSION) {
        throw new Error(
          `هذه نسخة احتياطية قديمة (${backupData.version}). الاستعادة الكاملة الآمنة تتطلب نسخة إصدار ${BACKUP_VERSION} التي تحتوي جميع جداول القاعدة.`
        );
      }

      if (!backupData.schema?.tableNames || !backupData.schema?.columns) {
        throw new Error("النسخة الاحتياطية لا تحتوي معلومات بنية قاعدة البيانات المطلوبة للاستعادة الآمنة");
      }

      const backupSchema = backupData.schema as DatabaseSchemaSnapshot;
      const tables = backupData.tables as Record<string, any[]>;

      for (const tableName of backupSchema.tableNames) {
        if (!Array.isArray(tables[tableName])) {
          throw new Error(`النسخة الاحتياطية غير مكتملة: بيانات الجدول ${tableName} مفقودة`);
        }
      }

      // نتحقق من تطابق البنية قبل بدء Transaction وقبل حذف أي بيانات.
      const currentSchema = await readDatabaseSchema(db);
      validateBackupSchema(backupSchema, currentSchema);

      const restoreTables = currentSchema.tableNames.filter(
        (tableName) => tableName !== MIGRATIONS_TABLE
      );
      const insertOrder = buildInsertOrder(restoreTables, currentSchema.foreignKeys);
      const deleteOrder = [...insertOrder].reverse();

      let restored = 0;

      try {
        restored = await db.transaction(async (tx) => {
          // الحذف: الأبناء أولاً وفق علاقات Foreign Key الفعلية في TiDB.
          for (const tableName of deleteOrder) {
            await tx.execute(sql`DELETE FROM ${identifier(tableName)}`);
          }

          // __drizzle_migrations لا يتم حذفه أو استبداله أثناء الاستعادة العادية.

          // الإدخال: الآباء أولاً، ثم الأبناء.
          let count = 0;
          for (const tableName of insertOrder) {
            count += await insertRawRows(
              tx,
              tableName,
              tables[tableName],
              currentSchema.columns[tableName] ?? []
            );
          }

          return count;
        });
      } catch (error: any) {
        // أي خطأ داخل Transaction يؤدي إلى Rollback تلقائياً.
        throw new Error(
          `فشل في استعادة النسخة الاحتياطية وتم التراجع عن جميع التغييرات: ${error.message}`
        );
      }

      // بعد الاستعادة قد لا يكون المستخدم الذي بدأ العملية موجوداً في النسخة المستعادة.
      // نستخدم performedBy فقط إذا كان ID ما زال موجوداً لتجنب كسر FK في audit_log.
      let auditUserId: number | undefined;
      if (ctx.user?.id) {
        const userResult = await db.execute(
          sql`SELECT id FROM ${identifier("users")} WHERE id = ${ctx.user.id} LIMIT 1`
        );
        const userRows = extractRawRows(userResult);
        if (userRows[0]?.id !== undefined) {
          auditUserId = Number(userRows[0].id);
        }
      }

      await logAuditAction({
        tableName: "backup",
        actionType: "RESTORE",
        actionDescription: `استعادة نسخة احتياطية كاملة (${BACKUP_VERSION}): ${restored} سجل تم استعادته`,
        newData: {
          version: BACKUP_VERSION,
          restored,
          migrationsPreserved: true,
          migrationRowsInBackup: tables[MIGRATIONS_TABLE]?.length ?? 0,
          tableCount: currentSchema.tableNames.length,
        },
        performedBy: auditUserId,
        performedByName: ctx.user?.name || "مستخدم",
        ipAddress: ctx.req?.ip || "unknown",
      });

      return {
        success: true,
        restored,
        errors: [] as string[],
        version: BACKUP_VERSION,
        migrationsPreserved: true,
        tableCount: currentSchema.tableNames.length,
      };
    }),

  // ==========================================
  // عرض النسخ الاحتياطية السابقة
  // ==========================================
  list: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("قاعدة البيانات غير متوفرة");

    const backups = await db
      .select()
      .from(auditLog)
      .where(
        sql`${auditLog.tableName} = 'backup' AND ${auditLog.actionType} = 'CREATE'`
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(20);

    return backups.map((b) => {
      const newData = b.newData as any;
      return {
        id: b.id,
        fileName: newData?.fileName || "نسخة احتياطية",
        url: newData?.url || null,
        stats: newData?.stats || {},
        totalRecords: newData?.stats
          ? Object.values(newData.stats as Record<string, number>).reduce(
              (a: number, b: number) => a + b,
              0
            )
          : 0,
        createdBy: b.performedByName || "مستخدم",
        createdAt: b.createdAt,
      };
    });
  }),
});
