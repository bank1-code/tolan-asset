import 'dotenv/config';
import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
const original=process.env.DATABASE_URL!;
const name=`tolan_repair_${Date.now()}_${randomBytes(4).toString('hex')}`;
if(!/^tolan_repair_\d+_[a-f0-9]{8}$/.test(name))throw new Error('Unsafe schema');
const admin=await mysql.createPool({uri:original,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionLimit:2});let created=false,isolated:mysql.Pool|undefined;
try{
 await admin.query(`CREATE DATABASE \`${name}\``);created=true;
 const target=new URL(original);target.pathname=`/${name}`;
 isolated=mysql.createPool({uri:target.toString(),ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionLimit:2});
 const constraints:any[]=[];
 if(process.argv.includes('--installation')||process.argv.includes('--upgrade')) {
  const manifest=process.argv.includes('--upgrade')?{directory:(await import('./acceptance-upgrade.mts')).baselinePackage}:JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
  const ddl=readFileSync(manifest.directory+'/schema-empty.sql','utf8');
  for(const statement of ddl.split(';').map(part=>part.trim()).filter(Boolean)) {
   if(!/^(CREATE TABLE|ALTER TABLE) /i.test(statement))throw new Error('Unexpected installation schema statement');
   await isolated.query(statement);
  }
 } else {
 const [tables]:any=await admin.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
 for(const row of tables){const table=String(Object.values(row)[0]);if(!/^[a-zA-Z0-9_]+$/.test(table))throw new Error('Unsafe table');const[ddl]:any=await admin.query(`SHOW CREATE TABLE \`${table}\``);const text=String(ddl[0]['Create Table']);for(const m of text.matchAll(/^\s*(CONSTRAINT[^\n]+FOREIGN KEY[^\n]*)/gm))constraints.push({table,line:m[1].replace(/,$/,'')});await isolated.query(text.replace(/^\s*CONSTRAINT[^\n]+FOREIGN KEY[^\n]*\n?/gm,'').replace(/,\s*\)/g,'\n)').replace(/\/\*T!\[[^\]]+\][\s\S]*?\*\//g,''));}
 for(const c of constraints)await isolated.query(`ALTER TABLE \`${c.table}\` ADD ${c.line}`);
 }
 const [taskSessionColumns]:any=await isolated.query("SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='sessionVersion'");
 if(!taskSessionColumns.length&&!process.argv.includes('--upgrade'))await isolated.query('ALTER TABLE users ADD COLUMN sessionVersion varchar(64) NULL');
 if(!process.argv.includes('--installation')&&!process.argv.includes('--upgrade')){
  await isolated.query("INSERT INTO users(id,openId,username,name,role,loginMethod) VALUES(1,'qa-repair-owner','qa-owner','QA Owner','owner','local')");
  await isolated.query('INSERT INTO depreciation_control(id,revision) VALUES(1,0)');
 }
 if(process.argv.includes('--security')) {
  process.env.DATABASE_URL=target.toString();process.env.JWT_SECRET=randomBytes(32).toString('hex');
  await (await import('./commercial-security-db.mts')).runSecurityDatabase(isolated);
  process.env.DATABASE_URL=original;
 } else if(process.argv.includes('--ui')) {
  process.env.DATABASE_URL=target.toString();
  process.env.JWT_SECRET=randomBytes(32).toString('hex');
  process.env.NODE_ENV='development';
  if(process.argv.includes('--upgrade')) await (await import('./acceptance-upgrade.mts')).runUpgrade(isolated);
  else if(process.argv.includes('--installation')) await (await import('./acceptance-installation.mts')).runInstallation(isolated);
  else if(process.argv.includes('--acceptance')) await (await import('./acceptance-load.mts')).runAcceptance(isolated);
  else await (await import('./repair-ui-server.mts')).runUi(isolated);
  process.env.DATABASE_URL=original;
 } else {
 const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','server/exclusions.integration.test.ts','server/history.integration.test.ts','server/warranty.integration.test.ts','server/backup.integration.test.ts','--maxWorkers=1','--testTimeout=120000','--hookTimeout=120000','--reporter=json','--outputFile=qa-results/repair-database-suite.json'],{stdio:'inherit',env:{...process.env,TEST_DATABASE_URL:target.toString(),RUN_EXCLUSION_DB_TESTS:'1',RUN_HISTORY_DB_TESTS:'1',RUN_WARRANTY_DB_TESTS:'1',RUN_BACKUP_DB_TESTS:'1'}});
 const exit=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
 writeFileSync('qa-results/repair-database-environment.json',JSON.stringify({schema:name,foreignKeys:constraints.length,exitCode:exit,originalDatabaseUntouched:true},null,2));process.exitCode=exit;
 }
}finally{await isolated?.end();if(created)await admin.query(`DROP DATABASE \`${name}\``);await admin.end();
 if(process.argv.includes('--acceptance')||process.argv.includes('--installation')||process.argv.includes('--roles'))writeFileSync(`qa-results/acceptance-${process.argv.includes('--acceptance')?'load':process.argv.includes('--installation')?'installation':'roles'}-environment.json`,JSON.stringify({isolatedDatabaseRemoved:created,originalDatabaseUntouched:true},null,2));
}
process.exit(process.exitCode??0);
