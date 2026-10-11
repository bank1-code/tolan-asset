// Read-only verification of records entered through the application's pages.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'node:fs';

const directory = 'qa-results/ui-full-cycle';
const approvalStage = process.argv.includes('--approval-stage');
const plan = JSON.parse(readFileSync(`${directory}/planned-data.json`, 'utf8'));
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
const checks = [];
const observed = [];
const progress = { asset: [], custody: [] };
const check = (key, name, passed) => checks.push({ key, name, passed: Boolean(passed) });
const cents = value => BigInt(String(value).replace('.', ''));
try {
  for (const entityType of ['asset', 'custody']) {
    const table = entityType === 'asset' ? 'assets' : 'custody_items';
    const name = entityType === 'asset' ? 'assetName' : 'name';
    const code = entityType === 'asset' ? 'assetCode' : 'code';
    const [rows] = await connection.query(`SELECT r.id, r.${name} AS name, r.${code} AS code, r.quantity, r.assetValue, r.notes, r.status, r.excludedQuantity, r.warrantyReplacedQuantity, r.approvedBy, r.approvedAt, r.draftVersion, c.code AS classificationCode, l.name AS locationName, d.name AS departmentName, b.name AS branchName, e.fullName AS employeeName FROM ${table} r LEFT JOIN financial_classifications c ON c.id=r.classificationId LEFT JOIN locations l ON l.id=r.locationId LEFT JOIN departments d ON d.id=r.departmentId LEFT JOIN branches b ON b.id=d.branchId LEFT JOIN employees e ON e.id=r.assignedTo ORDER BY r.id`);
    const [creationAudits] = await connection.query("SELECT a.recordId, u.username, u.role FROM audit_log a LEFT JOIN users u ON u.id=a.performedBy WHERE a.tableName=? AND a.actionType='CREATE' ORDER BY a.id", [table]);
    const [approvalAudits] = approvalStage ? await connection.query("SELECT a.recordId, a.performedBy, u.username, u.role FROM audit_log a LEFT JOIN users u ON u.id=a.performedBy WHERE a.tableName=? AND a.actionType='APPROVE' ORDER BY a.id", [table]) : [[]];
    for (const row of rows) {
      const creation = creationAudits.filter(audit => Number(audit.recordId) === Number(row.id));
      row.creationAuditCount = creation.length;
      row.creatorUsername = creation[0]?.username;
      row.creatorRole = creation[0]?.role;
      const key = String(row.notes ?? '').split(' | ')[0];
      const expected = plan.records.find(record => record.key === key && record.entityType === entityType);
      check(key, 'Known unique fixture', expected && !progress[entityType].includes(key));
      if (!expected) continue;
      progress[entityType].push(key);
      check(key, 'Name', row.name === expected.name);
      check(key, 'Quantity', Number(row.quantity) === expected.quantity);
      check(key, 'Unit value', cents(row.assetValue) === cents(expected.unitCost));
      check(key, 'Classification', row.classificationCode === expected.classificationCode);
      check(key, 'Location', row.locationName === plan.locations.find(x => x.key === expected.locationKey).name);
      check(key, 'Branch', row.branchName === plan.branches.find(x => x.key === expected.branchKey).name);
      check(key, 'Department', row.departmentName === plan.departments.find(x => x.key === expected.departmentKey).name);
      check(key, 'Employee', row.employeeName === plan.employees.find(x => x.key === expected.employeeKey).name);
      if (approvalStage && row.status === 'ACTIVE') {
        const approvals = approvalAudits.filter(audit => Number(audit.recordId) === Number(row.id));
        check(key, 'Approved by accounting manager with exactly one audit', Boolean(row.code && row.approvedBy && row.approvedAt) && approvals.length === 1 && approvals[0].username === 'qa_finance_manager' && approvals[0].role === 'accounting_manager' && Number(approvals[0].performedBy) === Number(row.approvedBy));
        check(key, 'Official number unique within entity type', rows.filter(item => item.code === row.code).length === 1);
      } else check(key, 'Draft with no official number or approval', row.status === 'DRAFT' && !row.code && !row.approvedBy && !row.approvedAt);
      check(key, 'No disposal or replacement', Number(row.excludedQuantity) === 0 && Number(row.warrantyReplacedQuantity) === 0);
      check(key, 'Exactly one accountant creation audit', Number(row.creationAuditCount) === 1 && row.creatorUsername === 'qa_accountant' && row.creatorRole === 'accountant');
      observed.push({ key, entityType, id: row.id, draftVersion: row.draftVersion, status: row.status, code: row.code });
    }
  }
  if (process.argv.includes('--require-complete')) {
    check('TOTAL', '100 assets', progress.asset.length === 100);
    check('TOTAL', '100 custody records', progress.custody.length === 100);
    for (const classification of plan.classifications) for (const entityType of ['asset', 'custody']) check(classification.code, `10 ${entityType} records`, observed.filter(row => row.entityType === entityType && plan.records.find(record => record.key === row.key)?.classificationCode === classification.code).length === 10);
  }
  const failed = checks.filter(item => !item.passed);
  const result = { checkedAt: new Date().toISOString(), sourceDatabaseModified: false, status: failed.length ? 'FAIL' : 'PASS_OBSERVED_RECORDS', counts: { asset: progress.asset.length, custody: progress.custody.length }, checked: checks.length, failed, observed, missing: plan.records.filter(record => !progress[record.entityType].includes(record.key)).map(record => record.key) };
  const approved = observed.filter(row => row.status === 'ACTIVE').length;
  writeFileSync(`${directory}/${approvalStage ? 'operational-approval-verification' : 'operational-input-verification'}.json`, JSON.stringify({...result, approved}, null, 2));
  if (!failed.length) writeFileSync(`${directory}/operational-input-progress.json`, JSON.stringify(progress, null, 2));
  console.log(JSON.stringify({ status: result.status, counts: result.counts, approved, checked: checks.length, failed, missingCount: result.missing.length }));
  if (failed.length) process.exitCode = 1;
} finally { await connection.end(); }
