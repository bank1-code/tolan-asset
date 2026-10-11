// Restores the safety snapshot ONLY into a newly-created disposable database.
// The source application's database is never written by this script.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const summary=JSON.parse(readFileSync('qa-results/ui-full-cycle/backup-summary.json','utf8'));
const backup=JSON.parse(Buffer.from(readFileSync(summary.filename,'utf8'),'base64').toString('utf8'));
const manifest=JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
const name=`tolan_ui_restore_verify_${Date.now()}_${randomBytes(4).toString('hex')}`;
if(!/^tolan_ui_restore_verify_\d+_[a-f0-9]{8}$/.test(name))throw Error('Invalid temporary schema');
const sourceUrl=process.env.DATABASE_URL,targetUrl=new URL(sourceUrl);targetUrl.pathname='/'+name;
if(new URL(sourceUrl).pathname===targetUrl.pathname)throw Error('Source and destination must differ');
const identifier=name=>{if(!/^[A-Za-z0-9_]+$/.test(name))throw Error('Unsafe SQL identifier');return '`'+name+'`';};
let admin,temporary,created=false;
const result={status:'RUNNING',temporarySchema:name,sourceDatabaseModified:false,temporarySchemaRemoved:false,tableChecks:[]};
try {
  admin=await mysql.createConnection({uri:sourceUrl,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
  await admin.query('CREATE DATABASE '+identifier(name));created=true;
  temporary=await mysql.createConnection({uri:targetUrl.toString(),timezone:'Z',ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
  for(const ddl of readFileSync(manifest.directory+'/schema-empty.sql','utf8').split(';').map(s=>s.trim()).filter(Boolean)){
    if(!/^(CREATE TABLE|ALTER TABLE) /i.test(ddl))throw Error('Unexpected DDL');await temporary.query(ddl);
  }
  const remaining=new Set(backup.schema.tableNames),ordered=[];
  while(remaining.size){const ready=[...remaining].filter(table=>!backup.schema.foreignKeys.some(f=>f.childTable===table&&f.parentTable!==table&&remaining.has(f.parentTable))).sort();if(!ready.length)throw Error('Cyclic dependencies');for(const table of ready){remaining.delete(table);ordered.push(table);}}
  await temporary.beginTransaction();
  for(const table of ordered){
    const columns=backup.schema.columns[table];
    for(const row of backup.tables[table]){
      const values=columns.map(column=>{
        const value=row[column.name];if(value===undefined||value===null)return null;
        if(column.dataType==='json')return typeof value==='string'?value:JSON.stringify(value);
        if(['timestamp','datetime'].includes(column.dataType))return new Date(value);
        return value;
      });
      await temporary.query(`INSERT INTO ${identifier(table)} (${columns.map(c=>identifier(c.name)).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,values);
    }
  }
  await temporary.commit();
  for(const table of ordered){const [rows]=await temporary.query('SELECT COUNT(*) AS n FROM '+identifier(table));const actual=Number(rows[0].n),expected=backup.tables[table].length;result.tableChecks.push({table,expected,actual,pass:actual===expected});if(actual!==expected)throw Error('Count mismatch: '+table);}
  const [foreignKeys]=await temporary.query("SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL");
  result.foreignKeys=Number(foreignKeys[0].n);if(result.foreignKeys!==backup.schema.foreignKeys.length)throw Error('Foreign key mismatch');
  const [users]=await temporary.query('SELECT id,openId,username,passwordHash,role,employeeId FROM users ORDER BY id');
  result.userIdentitiesAndHashesPreserved=users.every(user=>{const original=backup.tables.users.find(r=>r.id===user.id);return original&&['openId','username','passwordHash','role','employeeId'].every(key=>original[key]===user[key]);})&&users.length===backup.tables.users.length;
  if(!result.userIdentitiesAndHashesPreserved)throw Error('User identity mismatch');
  result.status='PASS';
}catch(error){result.status='FAIL';result.error=String(error.message).replaceAll(sourceUrl,'[REDACTED]');process.exitCode=1;
}finally{
  await temporary?.end();
  if(created){await admin.query('DROP DATABASE '+identifier(name));result.temporarySchemaRemoved=true;}
  await admin?.end();
  writeFileSync('qa-results/ui-full-cycle/backup-restore-verification.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,tableChecks:result.tableChecks.length,foreignKeys:result.foreignKeys,userIdentitiesAndHashesPreserved:result.userIdentitiesAndHashesPreserved,temporarySchemaRemoved:result.temporarySchemaRemoved,sourceDatabaseModified:false,error:result.error}));
}
