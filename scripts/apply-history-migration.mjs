import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  const before = {};
  for (const table of ['assets','custody_items','asset_exclusions','archive_documents','inventory_sessions','asset_transfers']) {
    const [count] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``); before[table] = Number(count[0].count);
  }
  console.log('Existing record counts:', JSON.stringify(before));
  if (!process.argv.includes('--check')) {
    const statements = readFileSync(new URL('../drizzle/0012_equal_ma_gnuci.sql', import.meta.url),'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
    for (const statement of statements) {
      const column = statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/), constraint = statement.match(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/);
      if (column) { const [found] = await db.query('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',column.slice(1)); if(found.length) continue; }
      if (constraint) { const [found] = await db.query('SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?',constraint.slice(1)); if(found.length) continue; }
      await db.query(statement.replace('CREATE TABLE `exclusion_attachments`','CREATE TABLE IF NOT EXISTS `exclusion_attachments`'));
    }
    const [columns] = await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'archive_documents' AND column_name IN ('sourceKey','snapshot','exclusionId','inventorySessionId')) OR (table_name = 'asset_exclusions' AND column_name IN ('originalUnitValue','entitySnapshot')))");
    const [constraints] = await db.query("SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_name IN ('archive_documents_sourceKey_unique','exclusion_attachments_exclusionId_asset_exclusions_id_fk','exclusion_attachments_createdBy_users_id_fk')");
    if (columns.length !== 6 || constraints.length !== 3) throw new Error('History schema verification incomplete. Re-run this idempotent migration.');
    for (const [table,count] of Object.entries(before)) { const [after] = await db.query(`SELECT COUNT(*) AS count FROM \`${table}\``); if(Number(after[0].count) !== count) throw new Error(`Record count changed for ${table}; inspect concurrent activity.`); }
    console.log('History migration verified. All existing records preserved; legacy snapshots were not fabricated.');
  } else console.log('Read-only preflight; schema not changed.');
} finally { await db.end(); }
