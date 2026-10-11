// Independent read-only reconciliation of reference records entered via UI.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'node:fs';
const directory = 'qa-results/ui-full-cycle';
const planned = JSON.parse(readFileSync(`${directory}/planned-data.json`, 'utf8'));
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
const result = { status: 'RUNNING', checkedAt: new Date().toISOString(), sourceDatabaseModified: false, inputMethod: 'Application UI', checks: [], observed: {} };
try {
  const queries = {
    locations: 'SELECT id,name,code,assetPrefix,custodyPrefix FROM locations ORDER BY code',
    branches: 'SELECT id,name,code,locationId FROM branches ORDER BY code',
    departments: 'SELECT id,name,code,branchId,locationId FROM departments ORDER BY code',
    employees: 'SELECT id,fullName,code,departmentId,fingerprintId FROM employees ORDER BY code',
    classifications: 'SELECT id,code,name,active FROM financial_classifications ORDER BY code',
  };
  for (const [key, query] of Object.entries(queries)) { const [rows] = await connection.query(query); result.observed[key] = rows; }
  const check = (key, pass) => { result.checks.push({ key, pass }); };
  for (const key of Object.keys(queries)) {
    check(`${key}: count`, result.observed[key].length === planned[key].length);
    check(`${key}: unique codes`, new Set(result.observed[key].map(row => row.code)).size === result.observed[key].length);
  }
  const lookup = (collection, predicate) => { const rows = collection.filter(predicate); return rows.length === 1 ? rows[0] : null; };
  const locations = {}, branches = {}, departments = {};
  for (const expected of planned.locations) {
    const row = lookup(result.observed.locations, row => row.name === expected.name); locations[expected.key] = row;
    check(expected.key, !!row && row.assetPrefix === expected.assetPrefix && row.custodyPrefix === expected.custodyPrefix);
  }
  for (const expected of planned.branches) {
    const row = lookup(result.observed.branches, row => row.name === expected.name); branches[expected.key] = row;
    check(expected.key, !!row && row.locationId === locations[expected.locationKey]?.id && row.code.startsWith(locations[expected.locationKey].code + '-'));
  }
  for (const expected of planned.departments) {
    const row = lookup(result.observed.departments, row => row.name === expected.name); departments[expected.key] = row;
    check(expected.key, !!row && row.branchId === branches[expected.branchKey]?.id && row.locationId === locations[expected.locationKey]?.id && row.code.startsWith(branches[expected.branchKey].code + '-'));
  }
  for (const expected of planned.employees) {
    const row = lookup(result.observed.employees, row => row.fullName === expected.name);
    check(expected.key, !!row && row.departmentId === departments[expected.departmentKey]?.id && row.fingerprintId === expected.fingerprintId && row.code.startsWith(departments[expected.departmentKey].code + '-'));
  }
  for (const expected of planned.classifications) {
    const row = lookup(result.observed.classifications, row => row.code === expected.code);
    check(expected.code, !!row && row.name === expected.name && !!row.active);
  }
  result.status = result.checks.every(item => item.pass) ? 'PASS' : 'FAIL';
  result.passed = result.checks.filter(item => item.pass).length;
  result.failed = result.checks.filter(item => !item.pass).length;
  if (result.failed) process.exitCode = 1;
} finally {
  await connection.end();
  writeFileSync(`${directory}/reference-data-verification.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, passed: result.passed, failed: result.failed, counts: Object.fromEntries(Object.entries(result.observed).map(([key, rows]) => [key, rows.length])), failedChecks: result.checks.filter(item => !item.pass), sourceDatabaseModified: false }));
}
