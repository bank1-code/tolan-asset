// Read-only application-state counts; no credentials or connection URL emitted.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync } from 'node:fs';
const connection = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  const [tables] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const counts = {};
  for (const { name } of tables) {
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw Error('Unsafe identifier');
    const [rows] = await connection.query('SELECT COUNT(*) AS n FROM `' + name + '`');
    counts[name] = Number(rows[0].n);
  }
  const [roles] = await connection.query('SELECT role, COUNT(*) AS count FROM users GROUP BY role ORDER BY role');
  const [foreignKeys] = await connection.query("SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL");
  const result = { checkedAt: new Date().toISOString(), sourceDatabaseModified: false, counts, roles, foreignKeys: Number(foreignKeys[0].n) };
  writeFileSync('qa-results/ui-full-cycle/database-state.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await connection.end(); }
