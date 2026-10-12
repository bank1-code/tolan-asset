import 'dotenv/config';
import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const database = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } });
try {
  const [columns] = await database.query("SELECT DATA_TYPE dataType,IS_NULLABLE nullable,COLUMN_DEFAULT columnDefault FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='fieldHelpLoginCount'");
  if (!columns.length) await database.query('ALTER TABLE users ADD COLUMN fieldHelpLoginCount INT NOT NULL DEFAULT 0');
  else if (columns[0].dataType !== 'int' || columns[0].nullable !== 'NO' || String(columns[0].columnDefault) !== '0') throw Error('Unexpected fieldHelpLoginCount schema');
  console.log('Field-help login counter ready. Existing users start at zero; business data preserved.');
} finally { await database.end(); }
