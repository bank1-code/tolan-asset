import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  for (const [table, column] of [['assets', 'assetCode'], ['custody_items', 'code']]) {
    const [duplicates] = await db.query(`SELECT 1 FROM \`${table}\` WHERE \`${column}\` IS NOT NULL GROUP BY \`${column}\` HAVING COUNT(*) > 1 LIMIT 1`);
    if (duplicates.length) console.log(`${table}: legacy duplicate codes detected and will be preserved; new approval numbers use a separate unique registry.`);
    const [counts] = await db.query(`SELECT status, COUNT(*) AS count FROM \`${table}\` GROUP BY status`);
    console.log(table, JSON.stringify(counts));
  }
  if (!process.argv.includes('--check')) {
    const statements = readFileSync(new URL('../drizzle/0011_curved_scrambler.sql', import.meta.url), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    for (const statement of statements) {
      const column = statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/);
      const constraint = statement.match(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/);
      if (column) {
        const [found] = await db.query('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', column.slice(1));
        if (found.length) continue;
      }
      if (constraint) {
        const [found] = await db.query('SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?', constraint.slice(1));
        if (found.length) continue;
      }
      await db.query(statement.replace('CREATE TABLE `inventory_approval_numbers`', 'CREATE TABLE IF NOT EXISTS `inventory_approval_numbers`'));
    }
    const [columns] = await db.query("SELECT table_name AS tableName, column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('assets', 'custody_items') AND column_name IN ('draftVersion','approvedBy','approvedAt','approvalSnapshot','reviewNote')");
    if (columns.length !== 10) throw new Error('Migration verification incomplete. Re-run this idempotent script.');
    const [constraints] = await db.query("SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema = DATABASE() AND constraint_name IN ('inventory_approval_number_unique', 'inventory_approval_entity_unique', 'inventory_approval_numbers_approvedBy_users_id_fk', 'assets_approvedBy_users_id_fk', 'custody_items_approvedBy_users_id_fk')");
    if (constraints.length !== 5) throw new Error('Migration constraint verification incomplete.');
    console.log('Verified approval fields and unique code constraints. Existing record statuses were preserved.');
  } else console.log('Read-only preflight passed. No changes applied.');
} finally { await db.end(); }
