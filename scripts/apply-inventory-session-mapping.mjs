import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  const source = readFileSync(new URL('../drizzle/0013_inventory_session_mapping.sql', import.meta.url),'utf8');
  for (const sql of source.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean)) {
    const match = sql.match(/CHANGE `([^`]+)` `([^`]+)`/);
    if(!match) throw new Error('Unexpected mapping statement.');
    const [oldColumn,newColumn] = match.slice(1);
    const [columns] = await db.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_sessions' AND column_name IN (?, ?)",[oldColumn,newColumn]);
    if(columns.some(column=>column.name===newColumn) && !columns.some(column=>column.name===oldColumn)) continue;
    if(columns.length !== 1 || columns[0].name !== oldColumn) throw new Error('Ambiguous inventory-session schema; manual inspection required.');
    await db.query(sql);
  }
  console.log('Inventory-session field mapping verified. Existing legacy columns and data preserved.');
} finally { await db.end(); }
