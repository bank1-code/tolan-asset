// Read-only source database snapshot. No deletes, inserts, updates or restore.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root='qa-results/ui-full-cycle/backups';
mkdirSync(root,{recursive:true});
const connection=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
let active=false;
try {
  const [tableRows]=await connection.query("SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
  const tableNames=tableRows.map(r=>r.tableName);
  if(!tableNames.length||!tableNames.includes('users'))throw Error('Unexpected empty source schema');
  const [columnRows]=await connection.query("SELECT TABLE_NAME AS tableName,COLUMN_NAME AS name,DATA_TYPE AS dataType,COLUMN_TYPE AS columnType,IS_NULLABLE AS isNullable,COLUMN_KEY AS `key`,EXTRA AS extra,ORDINAL_POSITION AS ordinalPosition FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
  const columns={};
  for(const row of columnRows){const {tableName,isNullable,...column}=row;(columns[tableName]??=[]).push({...column,nullable:isNullable==='YES'});}
  const [foreignKeys]=await connection.query("SELECT TABLE_NAME AS childTable,COLUMN_NAME AS childColumn,REFERENCED_TABLE_NAME AS parentTable,REFERENCED_COLUMN_NAME AS parentColumn,CONSTRAINT_NAME AS constraintName FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION");
  const tables={};
  await connection.beginTransaction(); active=true;
  for(const table of tableNames){if(!/^[A-Za-z0-9_]+$/.test(table))throw Error('Unsafe table identifier');const [rows]=await connection.query(`SELECT * FROM \`${table}\``);tables[table]=rows;}
  await connection.commit();active=false;
  const stats=Object.fromEntries(tableNames.map(name=>[name,tables[name].length]));
  const snapshot={version:'2.0',createdAt:new Date().toISOString(),createdBy:'Authorized local read-only safety snapshot before UI QA',metadata:{fullDatabaseBackup:true,tableCount:tableNames.length,migrationTable:{name:'__drizzle_migrations',includedInBackup:tableNames.includes('__drizzle_migrations'),restoredAutomatically:false}},schema:{tableNames,columns,foreignKeys},tables,stats};
  const filename=`${root}/before-reset-${snapshot.createdAt.replace(/[:.]/g,'-')}.tln`;
  writeFileSync(filename,Buffer.from(JSON.stringify(snapshot,(_key,value)=>typeof value==='bigint'?value.toString():value)).toString('base64'),{mode:0o600});
  const actual=readFileSync(filename);const decoded=JSON.parse(Buffer.from(actual.toString(),'base64').toString('utf8'));
  if(decoded.schema.tableNames.length!==tableNames.length||tableNames.some(name=>decoded.tables[name].length!==stats[name]))throw Error('Snapshot round-trip failed');
  const result={status:'LOCAL_SNAPSHOT_SAVED_AND_DECODE_VERIFIED',filename,sha256:createHash('sha256').update(actual).digest('hex'),createdAt:snapshot.createdAt,tableCount:tableNames.length,foreignKeys:foreignKeys.length,counts:stats,sourceDatabaseModified:false,isolatedRestoreTested:false,containsSensitiveUserAuthenticationData:true};
  writeFileSync('qa-results/ui-full-cycle/backup-summary.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,filename,tableCount:result.tableCount,records:Object.values(stats).reduce((a,b)=>a+b,0),sourceDatabaseModified:false,isolatedRestoreTested:false}));
}finally {if(active)await connection.rollback();await connection.end();}
