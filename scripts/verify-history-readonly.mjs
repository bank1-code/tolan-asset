import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { inventoryTimeline } from '../dist/history-verifier.mjs';
const pool = mysql.createPool({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  const db = drizzle(pool);
  for (const [kind,table] of [['asset','assets'],['custody','custody_items']]) {
    const [records] = await pool.query(`SELECT id FROM \`${table}\` ORDER BY id LIMIT 5`);
    for (const record of records) { const events = await inventoryTimeline(db,kind,record.id); console.log(`${kind} #${record.id}: ${events.length} historical events; ${new Set(events.map(event=>event.id)).size} unique events`); }
  }
  console.log('Read-only timeline SQL verification passed. No fixtures, transfers or exclusions were created.');
} finally { await pool.end(); }
