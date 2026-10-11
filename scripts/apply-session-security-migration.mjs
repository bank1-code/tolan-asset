import 'dotenv/config';
import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const database = await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try {
  const [columns] = await database.query("SELECT COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='sessionVersion'");
  if (!columns.length) await database.query('ALTER TABLE users ADD COLUMN sessionVersion varchar(64) NULL');
  else if (columns[0].type !== 'varchar(64)') throw new Error('Unexpected sessionVersion schema');
  console.log('Session revocation schema ready; existing accounts and business records preserved. Legacy sessions require login.');
} finally { await database.end(); }
