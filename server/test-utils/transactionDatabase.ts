import { getTableName, getTableColumns } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

/** Transactional test adapter. No network access or real database writes. */
export function transactionDatabase(initial: Record<string, any[]>) {
  let rows = structuredClone(initial);
  const dialect = new MySqlDialect();
  const locks: string[] = [];
  const failures = new Map<string, number>();
  const attempts = new Map<string, number>();
  const properties = new Map<string, Record<string, string>>();
  const register = (table: any) => { const name = getTableName(table); properties.set(name, Object.fromEntries(Object.entries(getTableColumns(table)).map(([key, column]: [string, any]) => [column.name, key]))); return name; };
  const read = (context: any, table: string, column: string) => context[table]?.[properties.get(table)?.[column] || column];
  const checkFailure = (table: string) => {
    const count = (attempts.get(table) || 0) + 1;
    attempts.set(table, count);
    if (failures.get(table) === count) throw new Error(`Injected ${table} failure`);
  };
  // Reproduce MySQL's strict varchar boundary so transactional workflow tests
  // detect persistence failures that permissive in-memory inserts would hide.
  const checkTextLengths = (table: any, value: any) => {
    for (const [key, column] of Object.entries(getTableColumns(table)) as [string, any][]) {
      const limit = /^varchar\((\d+)\)$/i.exec(column.getSQLType());
      if (limit && typeof value[key] === "string" && Array.from(value[key]).length > Number(limit[1]))
        throw new Error(`Data too long for ${getTableName(table)}.${column.name}`);
    }
  };
  const matches = (context: Record<string, any>, condition: any): boolean => {
    if (!condition) return true;
    const { sql, params } = dialect.sqlToQuery(condition);
    let index = 0;
    for (const part of sql.matchAll(/`([^`]+)`\.`([^`]+)` = (\?|`([^`]+)`\.`([^`]+)`)/g)) {
      const actual = read(context, part[1], part[2]);
      const offset = (sql.slice(0, part.index).match(/\?/g) || []).length;
      const expected = part[3] === "?" ? params[offset] : read(context, part[4], part[5]);
      if (actual !== expected) return false;
    }
    for (const part of sql.matchAll(/`([^`]+)`\.`([^`]+)` in \(([^)]+)\)/gi)) {
      const offset = (sql.slice(0, part.index).match(/\?/g) || []).length;
      const count = (part[3].match(/\?/g) || []).length;
      if (!params.slice(offset, offset + count).includes(read(context, part[1], part[2]))) return false;
    }
    const remainder = /`([^`]+)`\.`quantity` - COALESCE\(`[^`]+`\.`excludedQuantity`, 0\)(?: - `[^`]+`\.`warrantyReplacedQuantity`)? > 0/.exec(sql);
    const operational = /`([^`]+)`\.`status` NOT IN \('DRAFT', 'CANCELLED'\)/.exec(sql);
    if (operational && ["DRAFT", "CANCELLED"].includes(context[operational[1]]?.status)) return false;
    return !remainder || context[remainder[1]].quantity - (context[remainder[1]].excludedQuantity || 0) - (context[remainder[1]].warrantyReplacedQuantity || 0) > 0;
  };
  const project = (context: Record<string, any>, projection: any, base: string) => {
    if (!projection) return context[base];
    return Object.fromEntries(Object.entries(projection).map(([key, field]: [string, any]) => {
      if (field.table && field.name) { register(field.table); return [key, read(context, getTableName(field.table), field.name) ?? null]; }
      if (field.getSQL) {
        const expression = dialect.sqlToQuery(field.getSQL()).sql;
        if (/^JSON_OBJECT\(/i.test(expression.trim())) {
          const pairs = [...expression.matchAll(/'([^']+)'\s*,\s*JSON_EXTRACT\(`([^`]+)`\.`([^`]+)`,\s*'\$\.([^']+)'\)/gi)];
          if (pairs.length) return [key, Object.fromEntries(pairs.map(([, label, table, column, path]) => {
            const source = read(context, table, column);
            const json = typeof source === "string" ? JSON.parse(source) : source;
            const value = path.split(".").reduce((current: any, part) => current?.[part], json);
            return [label, value ?? null];
          }))];
        }
      }
      return [key, context[getTableName(field)] ?? null];
    }));
  };
  const db: any = {
    rows: () => rows,
    locks,
    failOn: (table: string, attempt = 1) => failures.set(table, attempt),
    async transaction(callback: any) {
      const before = structuredClone(rows);
      try { return await callback(db); }
      catch (error) { rows = before; throw error; }
    },
    select(projection?: any) {
      return { from(table: any) {
        const name = register(table);
        const joins: Array<{ name: string; condition: any }> = [];
        let condition: any, count = Infinity, offset = 0;
        const query: any = {
          leftJoin(table: any, condition: any) { joins.push({ name: register(table), condition }); return query; },
          where(value: any) { condition = value; return query; },
          limit(value: number) { count = value; return query; },
          offset(value: number) { offset = value; return query; },
          orderBy: () => query,
          for(value: string) { locks.push(`${name}:${value}`); return query; },
          then(resolve: any, reject: any) {
            return Promise.resolve().then(() => {
              let contexts = (rows[name] || []).map(row => ({ [name]: row }));
              for (const join of joins) {
                contexts = contexts.flatMap(context => {
                  const found = (rows[join.name] || []).map(row => ({ ...context, [join.name]: row })).filter(context => matches(context, join.condition));
                  return found.length ? found : [{ ...context, [join.name]: null }];
                });
              }
              return structuredClone(contexts.filter(context => matches(context, condition)).slice(offset, offset + count).map(context => project(context, projection, name)));
            }).then(resolve, reject);
          },
        };
        return query;
      }};
    },
    insert(table: any) {
      return { values(value: any) {
        const name = getTableName(table);
        let upsert = false;
        const query: any = { onDuplicateKeyUpdate() { upsert = true; return query; }, then(resolve: any, reject: any) { return Promise.resolve().then(() => {
        checkFailure(name);
        for (const item of Array.isArray(value) ? value : [value]) checkTextLengths(table, item);
        if (Array.isArray(value)) {
          rows[name] ||= [];
          const firstId = Math.max(0, ...rows[name].map(row => row.id)) + 1;
          for (const [index, item] of value.entries()) rows[name].push(structuredClone({id: firstId + index, createdAt: new Date("2026-10-05T10:00:00Z"), ...item}));
          return [{insertId: firstId}];
        }
        if (upsert && name === "app_settings") {
          const settings = (rows[name] || []).find(row => row.id === value.id);
          if (settings) return [{ insertId: settings.id }];
        }
        const existing = name === "exclusion_sequence" && (rows[name] || []).find(row => row.year === value.year);
        if (existing && upsert) { existing.seq++; return [{ insertId: existing.id }]; }
        if (name === "inventory_approval_numbers" && (rows[name] || []).some(row => row.entityType === value.entityType && (row.code === value.code || row.entityId === value.entityId)))
          throw new Error("Duplicate approval number or entity");
        const id = Math.max(0, ...(rows[name] || []).map(row => row.id)) + 1;
        rows[name] ||= [];
        rows[name].push(structuredClone({ id, createdAt: new Date("2026-10-05T10:00:00Z"), ...value }));
        return [{ insertId: id }];
        }).then(resolve, reject); } }; return query;
      }};
    },
    update(table: any) {
      return { set(value: any) { return { async where(condition: any) {
        const name = getTableName(table);
        checkFailure(name);
        checkTextLengths(table, value);
        for (const row of rows[name] || []) if (matches({ [name]: row }, condition)) Object.assign(row, structuredClone(value));
      }}; }};
    },
    delete(table: any) { return { async where(condition: any) { const name = getTableName(table); checkFailure(name); rows[name] = (rows[name] || []).filter(row => !matches({ [name]: row }, condition)); } }; },
  };
  return db;
}
