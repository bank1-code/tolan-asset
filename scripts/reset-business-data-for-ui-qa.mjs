// Explicitly authorized 2026-10-10: clear application data directly in the
// configured database; preserve current users and migration/control metadata.
// New QA business entries are made through the application's UI, not this file.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const directory = 'qa-results/ui-full-cycle';
const resultPath = `${directory}/database-reset-result.json`;
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
const sha = value => createHash('sha256').update(value).digest('hex');
const identifier = name => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error('Unsafe SQL identifier');
  return '`' + name + '`';
};
const verifiedSummary = JSON.parse(readFileSync(`${directory}/backup-summary.json`, 'utf8'));
const verification = JSON.parse(readFileSync(`${directory}/backup-restore-verification.json`, 'utf8'));
const verifiedBytes = readFileSync(verifiedSummary.filename);
if (verification.status !== 'PASS' || !verification.userIdentitiesAndHashesPreserved || sha(verifiedBytes) !== verifiedSummary.sha256) {
  throw Error('A verified safety backup is required');
}
if (process.argv[2] !== '--execute-authorized-reset') throw Error('Explicit execution flag required');
if (existsSync(resultPath)) throw Error('Reset already has a recorded result; review it before any repeat');
const verified = JSON.parse(Buffer.from(verifiedBytes.toString(), 'base64').toString('utf8'));
const preserved = new Set(['users', '__drizzle_migrations', 'depreciation_control']);
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z', ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
let active = false;
const result = { status: 'RUNNING', authorization: 'User explicitly requested database cleanup while preserving users', startedAt: new Date().toISOString(), backup: null, tableChecks: [] };
try {
  const [tableRows] = await connection.query("SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const names = tableRows.map(row => row.tableName);
  if (stringify(names) !== stringify([...verified.schema.tableNames].sort())) throw Error('Source schema differs from verified backup');
  const [columnRows] = await connection.query("SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name,DATA_TYPE AS dataType,COLUMN_TYPE AS columnType,IS_NULLABLE AS isNullable,COLUMN_KEY AS `key`,EXTRA AS extra,ORDINAL_POSITION AS ordinalPosition FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
  const columns = {};
  for (const row of columnRows) { const { tableName, isNullable, ...column } = row; (columns[tableName] ??= []).push({ ...column, nullable: isNullable === 'YES' }); }
  const [foreignKeys] = await connection.query("SELECT TABLE_NAME AS childTable,COLUMN_NAME AS childColumn,REFERENCED_TABLE_NAME AS parentTable,REFERENCED_COLUMN_NAME AS parentColumn,CONSTRAINT_NAME AS constraintName FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION");
  if (stringify(columns) !== stringify(verified.schema.columns) || stringify(foreignKeys) !== stringify(verified.schema.foreignKeys)) throw Error('Schema metadata changed since restore verification');
  const remaining = new Set(names), ordered = [];
  while (remaining.size) {
    const ready = [...remaining].filter(table => !foreignKeys.some(f => f.childTable === table && f.parentTable !== table && remaining.has(f.parentTable))).sort();
    if (!ready.length) throw Error('Cyclic dependency; no data was deleted');
    for (const table of ready) { remaining.delete(table); ordered.push(table); }
  }
  await connection.beginTransaction(); active = true;
  const tables = {};
  // The local application service is stopped for maintenance. Lock the rows
  // while taking the final snapshot and performing the dependent deletes.
  for (const table of names) { const [rows] = await connection.query(`SELECT * FROM ${identifier(table)} FOR UPDATE`); tables[table] = rows; }
  if (!tables.users.length || !tables.depreciation_control.some(row => row.id === 1)) throw Error('Required user/control metadata missing');
  const stats = Object.fromEntries(names.map(name => [name, tables[name].length]));
  const snapshot = { version: '2.0', createdAt: new Date().toISOString(), createdBy: 'Authorized local safety snapshot immediately before database cleanup', metadata: { fullDatabaseBackup: true, tableCount: names.length, migrationTable: { name: '__drizzle_migrations', includedInBackup: true, restoredAutomatically: false } }, schema: { tableNames: names, columns, foreignKeys }, tables, stats };
  mkdirSync(`${directory}/backups`, { recursive: true });
  const filename = `${directory}/backups/immediately-before-reset-${snapshot.createdAt.replace(/[:.]/g, '-')}.tln`;
  const bytes = Buffer.from(stringify(snapshot)).toString('base64');
  writeFileSync(filename, bytes, { mode: 0o600, flag: 'wx' });
  const saved = readFileSync(filename);
  if (saved.toString() !== bytes || stringify(JSON.parse(Buffer.from(saved.toString(), 'base64').toString('utf8'))) !== stringify(snapshot)) throw Error('Final backup verification failed');
  result.backup = { filename, sha256: sha(saved), schemaMatchesPreviouslyRestoredBackup: true, counts: stats };
  result.businessRecordsChangedSinceEarlierBackup = names.filter(name => !preserved.has(name)).filter(name => stringify(tables[name]) !== stringify(verified.tables[name]));
  await connection.query('UPDATE users SET employeeId=NULL WHERE employeeId IS NOT NULL');
  for (const table of [...ordered].reverse().filter(name => !preserved.has(name))) {
    await connection.query(`DELETE FROM ${identifier(table)}`);
  }
  await connection.query('UPDATE depreciation_control SET revision=0 WHERE id=1');
  for (const table of names) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS n FROM ${identifier(table)}`);
    const expected = preserved.has(table) ? stats[table] : 0;
    const actual = Number(rows[0].n);
    result.tableChecks.push({ table, before: stats[table], expected, actual, pass: actual === expected });
    if (actual !== expected) throw Error('Unexpected row count: ' + table);
  }
  const [users] = await connection.query('SELECT * FROM users ORDER BY id');
  // Preserve every current user field except the detached employee link and
  // the automatically updated modification timestamp.
  const userKeys = columns.users.map(column => column.name).filter(key => !['employeeId', 'updatedAt'].includes(key));
  result.userAccountsPreserved = users.length === tables.users.length && users.every(user => {
    const before = tables.users.find(row => row.id === user.id);
    return before && user.employeeId === null && userKeys.every(key => stringify(before[key]) === stringify(user[key]));
  });
  if (!result.userAccountsPreserved) throw Error('Current user identity, credentials or session metadata changed');
  const [migrations] = await connection.query('SELECT * FROM __drizzle_migrations');
  if (stringify(migrations) !== stringify(tables.__drizzle_migrations)) throw Error('Migration metadata changed');
  const [control] = await connection.query('SELECT revision FROM depreciation_control WHERE id=1');
  if (Number(control[0]?.revision) !== 0) throw Error('Financial control reset failed');
  await connection.commit(); active = false;
  result.status = 'PASS_COMMITTED';
  result.businessRecordsRemaining = 0;
  result.businessRecordsDeleted = names.filter(name => !preserved.has(name)).reduce((sum, name) => sum + stats[name], 0);
  result.usersPreserved = users.length;
  result.foreignKeysPreserved = foreignKeys.length;
  result.finishedAt = new Date().toISOString();
} catch (error) {
  if (active) { await connection.rollback(); active = false; }
  result.status = 'FAILED_ROLLED_BACK';
  result.error = String(error.message).replaceAll(process.env.DATABASE_URL ?? '', '[REDACTED]');
  process.exitCode = 1;
} finally {
  await connection.end();
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, backup: result.backup?.filename, usersPreserved: result.usersPreserved, businessRecordsDeleted: result.businessRecordsDeleted, businessRecordsRemaining: result.businessRecordsRemaining, tableChecks: result.tableChecks.length, foreignKeysPreserved: result.foreignKeysPreserved, userAccountsPreserved: result.userAccountsPreserved, error: result.error }));
}
