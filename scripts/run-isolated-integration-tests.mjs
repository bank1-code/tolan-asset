// Authorized opt-in integration runner. Source application tables are read only.
// Clone the actual schema and foreign keys; fixtures contain no source business/user data.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {createHash,randomBytes} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve('qa-results/ui-full-cycle'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const run=path.join(root,`isolated-13-${stamp}`);mkdirSync(run,{recursive:true});
const sourceUrl=process.env.DATABASE_URL;if(!sourceUrl)throw Error('DATABASE_URL required');
const original=new URL(sourceUrl),sourceName=decodeURIComponent(original.pathname.slice(1));
const schemaName=`tolan_qa13_${Date.now()}_${randomBytes(4).toString('hex')}`;
const ownedName=name=>/^tolan_qa13_\d+_[a-f0-9]{8}$/.test(name)&&name===schemaName&&name!==sourceName;
const id=name=>{if(!/^[A-Za-z0-9_]+$/.test(name))throw Error('Unsafe SQL identifier');return '`'+name+'`';};
const ssl={minVersion:'TLSv1.2',rejectUnauthorized:true};
const target=new URL(sourceUrl);target.pathname='/'+schemaName;
const safeError=e=>String(e?.message??e).replaceAll(sourceUrl,'[SOURCE_CONNECTION]').replaceAll(target.toString(),'[TEST_CONNECTION]');
let source,test,created=false,before,metadata;
const result={startedAt:new Date().toISOString(),status:'RUNNING',runDirectory:run,temporarySchema:schemaName,temporarySchemaCreated:false,sourceDatabaseWrittenByRunner:false,sourceUnchanged:false,temporarySchemaRemoved:false,syntheticFixturesOnly:true,tests:null};
async function readMetadata(db){
 const [tables]=await db.query("SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME");
 const [columns]=await db.query("SELECT TABLE_NAME tableName,COLUMN_NAME name,DATA_TYPE dataType,COLUMN_TYPE columnType,IS_NULLABLE nullable,COLUMN_KEY columnKey,EXTRA extra,ORDINAL_POSITION ordinalPosition FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
 const [foreignKeys]=await db.query("SELECT TABLE_NAME childTable,COLUMN_NAME childColumn,REFERENCED_TABLE_NAME parentTable,REFERENCED_COLUMN_NAME parentColumn,CONSTRAINT_NAME constraintName,REFERENCED_TABLE_SCHEMA parentSchema FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION");
 return {tableNames:tables.map(t=>t.name),columns,foreignKeys};
}
async function fingerprint(db,m,backup=false){
 const hashes={},counts={};
 const backupDirectory=path.join(root,'backups',`before-isolated-13-${stamp}`);
 if(backup)mkdirSync(backupDirectory,{recursive:true});
 await db.beginTransaction();
 try{
  for(const name of m.tableNames){
   const names=m.columns.filter(c=>c.tableName===name&&c.columnKey==='PRI').map(c=>c.name),keys=names.map(id);
   if(!keys.length)throw Error('Stable source fingerprint requires a primary key: '+name);
   const hash=createHash('sha256');let last=null,count=0;
   const file=path.join(backupDirectory,`${name}.jsonl`);if(backup)writeFileSync(file,'',{mode:0o600});
   while(true){
    const condition=!last?'':keys.length===1?` WHERE ${keys[0]} > ?`:` WHERE (${keys.join(',')}) > (${keys.map(()=>'?').join(',')})`;
    const [rows]=await db.query(`SELECT * FROM ${id(name)}${condition} ORDER BY ${keys.join(',')} LIMIT 25`,last??[]);
    if(!rows.length)break;
    const encoded=rows.map(row=>JSON.stringify(row,(_k,x)=>typeof x==='bigint'?x.toString():x)).join('\n')+'\n';
    hash.update(encoded);if(backup)appendFileSync(file,encoded);
    count+=rows.length;last=names.map(key=>rows.at(-1)[key]);
   }
   hashes[name]=hash.digest('hex');counts[name]=count;
   if(['audit_log','archive_documents','depreciation_periods'].includes(name))console.log(`Source ${backup?'before':'after'} fingerprint: ${name}, ${count} rows.`);
  }
  await db.commit();
 }catch(e){await db.rollback();throw e;}
 if(backup){
  const columns=Object.fromEntries(m.tableNames.map(t=>[t,m.columns.filter(c=>c.tableName===t).map(({tableName,nullable,columnKey,...c})=>({...c,nullable:nullable==='YES',key:columnKey}))]));
  const snapshot={version:'QA_NDJSON_1',createdAt:new Date().toISOString(),createdBy:'Read-only safety snapshot before isolated integration tests',metadata:{fullDatabaseBackup:true,tableCount:m.tableNames.length},schema:{tableNames:m.tableNames,columns,foreignKeys:m.foreignKeys.map(({parentSchema,...f})=>f)},tableFiles:Object.fromEntries(m.tableNames.map(t=>[t,`${t}.jsonl`])),stats:counts,sha256:hashes};
  writeFileSync(path.join(backupDirectory,'manifest.json'),JSON.stringify(snapshot,null,2),{mode:0o600});result.localSafetySnapshotSaved=true;
 }
 return {hashes,counts};
}
try{
 source=await mysql.createConnection({uri:sourceUrl,ssl,dateStrings:true,timezone:'Z'});
 metadata=await readMetadata(source);
 if(metadata.tableNames.length<20||!metadata.tableNames.includes('users'))throw Error('Unexpected source schema');
 if(metadata.foreignKeys.some(f=>f.parentSchema!==sourceName))throw Error('Cross-schema reference requires separate review');
 console.log('Reading source fingerprints and saving a private local safety snapshot.');
 before=await fingerprint(source,metadata,true);
 writeFileSync(path.join(run,'source-before.json'),JSON.stringify(before,null,2));
 const definitions=new Map();
 for(const table of metadata.tableNames){
  const [ddl]=await source.query('SHOW CREATE TABLE '+id(table));
  const definition=String(ddl[0]['Create Table']);
  if(!/^CREATE TABLE /i.test(definition)||definition.includes(id(sourceName)+'.'))throw Error('Unexpected qualified table definition');
  definitions.set(table,definition);
 }
 const [charset]=await source.query('SELECT DEFAULT_CHARACTER_SET_NAME charset,DEFAULT_COLLATION_NAME collation FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=DATABASE()');
 if(!ownedName(schemaName))throw Error('Isolation name check failed');
 await source.query(`CREATE DATABASE ${id(schemaName)} CHARACTER SET ${id(charset[0].charset)} COLLATE ${id(charset[0].collation)}`);created=true;result.temporarySchemaCreated=true;
 test=await mysql.createConnection({uri:target.toString(),ssl,dateStrings:true,timezone:'Z'});
 const [selected]=await test.query('SELECT DATABASE() name');if(selected[0].name!==schemaName)throw Error('Target identity check failed');
 const remaining=new Set(metadata.tableNames);
 while(remaining.size){
  const ready=[...remaining].filter(t=>!metadata.foreignKeys.some(f=>f.childTable===t&&f.parentTable!==t&&remaining.has(f.parentTable)));
  if(!ready.length)throw Error('Cyclic foreign keys need a dedicated clone strategy');
  for(const table of ready){await test.query(definitions.get(table));remaining.delete(table);}
 }
 const cloned=await readMetadata(test);
 const signature=m=>JSON.stringify({tableNames:m.tableNames,columns:m.columns,foreignKeys:m.foreignKeys.map(({parentSchema,...f})=>f)});
 if(signature(cloned)!==signature(metadata))throw Error('Clone schema/foreign-key mismatch');
 result.schemaTables=cloned.tableNames.length;result.foreignKeys=cloned.foreignKeys.length;result.exactSchemaMatch=true;
 await test.query("INSERT INTO users(id,openId,name,role,sessionVersion) VALUES(1,?,'Isolated QA owner','owner','isolated-qa-session')",[`qa-isolated-${schemaName}`]);
 await test.query('INSERT INTO depreciation_control(id,revision) VALUES(1,0)');
 console.log(`Isolated schema ready: ${result.schemaTables} tables, ${result.foreignKeys} foreign-key columns. No source records copied.`);
 await test.end();test=null;
 const output=path.join(run,'vitest-results.json'),log=path.join(run,'vitest-output.log');let chunks='';
 // The child cannot connect to the source application, even if a database mock is missed.
 const blockedSource=new URL('mysql://unavailable:unavailable@127.0.0.1:1/'+encodeURIComponent(sourceName));
 const env={...process.env,DATABASE_URL:blockedSource.toString(),TEST_DATABASE_URL:target.toString(),RUN_BACKUP_DB_TESTS:'1',RUN_EXCLUSION_DB_TESTS:'1',RUN_HISTORY_DB_TESTS:'1',RUN_WARRANTY_DB_TESTS:'1'};
 const files=['server/backup.integration.test.ts','server/exclusions.integration.test.ts','server/history.integration.test.ts','server/warranty.integration.test.ts'];
 const exitCode=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.resolve('node_modules/vitest/vitest.mjs'),'run',...files,'--no-file-parallelism','--maxWorkers=1','--testTimeout=90000','--hookTimeout=120000','--reporter=default','--reporter=json',`--outputFile=${output}`],{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{const s=safeError(b.toString());chunks+=s;process.stdout.write(s);});
  child.stderr.on('data',b=>{const s=safeError(b.toString());chunks+=s;process.stderr.write(s);});
  child.on('error',reject);child.on('close',resolve);
 });
 writeFileSync(log,chunks);
 const actual=JSON.parse(readFileSync(output,'utf8'));
 result.tests={total:actual.numTotalTests,passed:actual.numPassedTests,failed:actual.numFailedTests,skipped:actual.numPendingTests,exitCode};
 result.status=exitCode===0&&actual.success&&actual.numTotalTests===13&&actual.numPassedTests===13&&actual.numPendingTests===0?'PASS':'FAIL';
}catch(e){result.status='FAIL';result.error=safeError(e);console.error('Isolated runner failed:',result.error);}
finally{
 try{await test?.end();}catch(e){result.cleanupError=safeError(e);}
 if(source&&before){
  try{
   const current=await readMetadata(source),after=await fingerprint(source,current);
   result.sourceUnchanged=JSON.stringify(before)===JSON.stringify(after);
   result.sourceTableCount=current.tableNames.length;
   writeFileSync(path.join(run,'source-after.json'),JSON.stringify(after,null,2));
   if(!result.sourceUnchanged){result.status='FAIL';result.sourceChangedTables=current.tableNames.filter(t=>before.hashes[t]!==after.hashes[t]);}
  }catch(e){result.status='FAIL';result.sourceVerificationError=safeError(e);}
 }
 if(created&&source){
  try{if(!ownedName(schemaName))throw Error('Refusing to drop unowned schema');await source.query('DROP DATABASE '+id(schemaName));const [left]=await source.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[schemaName]);result.temporarySchemaRemoved=left.length===0;}
  catch(e){result.status='FAIL';result.cleanupError=safeError(e);}
 }
 if(!created)result.temporarySchemaRemoved=true;
 await source?.end();result.completedAt=new Date().toISOString();
 if(!result.sourceUnchanged||!result.temporarySchemaRemoved)result.status='FAIL';
 writeFileSync(path.join(run,'summary.json'),JSON.stringify(result,null,2));
 writeFileSync(path.join(root,'isolated-integration-latest.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));process.exitCode=result.status==='PASS'?0:1;
}
