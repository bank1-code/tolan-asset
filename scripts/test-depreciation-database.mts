import "dotenv/config";
import mysql from "mysql2/promise";
import {randomBytes} from "node:crypto";
import {strict as assert} from "node:assert";
import {depreciationRouter} from "../server/depreciationRouter";
import {getDb} from "../server/db";

// Provision a fresh schema, copy structure only, and remove only the schema created here.
// Never run tests against DATABASE_URL's original database and never copy its records.
const original=process.env.DATABASE_URL;if(!original)throw new Error("DATABASE_URL required");
const schemaName=`tolan_dep_test_${Date.now()}_${randomBytes(4).toString("hex")}`;
if(!/^tolan_dep_test_\d+_[a-f0-9]{8}$/.test(schemaName))throw new Error("Unsafe test schema name");
const admin=await mysql.createConnection({uri:original,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
let created=false;
try {
 await admin.query(`CREATE DATABASE \`${schemaName}\``);created=true;
 const [tableRows]=await admin.query<any[]>("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
 const definitions:string[]=[];
 for(const row of tableRows){const table=String(Object.values(row)[0]);if(!/^[a-zA-Z0-9_]+$/.test(table))throw new Error("Unsafe table name");const[definition]=await admin.query<any[]>(`SHOW CREATE TABLE \`${table}\``);definitions.push(String(definition[0]["Create Table"]).replace(/^\s*CONSTRAINT[^\n]+FOREIGN KEY[^\n]*\n?/gm,"").replace(/,\s*\)/g,"\n)").replace(/\/\*T!\[[^\]]+\][\s\S]*?\*\//g,""));}
 const target=new URL(original);target.pathname=`/${schemaName}`;process.env.DATABASE_URL=target.toString();
 const isolated=await mysql.createConnection({uri:target.toString(),ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
 try {
  for(const definition of definitions)await isolated.query(definition);
  await isolated.query("INSERT INTO depreciation_control(id,revision) VALUES(1,0)");
  await isolated.query("INSERT INTO users(id,openId,name,role) VALUES(1,'test-maker','محاسب الاختبار','accountant'),(2,'test-reviewer','مدير الاختبار','accounting_manager')");
  await isolated.query("INSERT INTO financial_classifications(id,code,name,active) VALUES(1,'F','أثاث',1)");
  await isolated.query("INSERT INTO assets(id,assetName,assetCode,quantity,status,classificationId) VALUES(1,'أثاث','TEST-A1',2,'ACTIVE',1)");
  const context=(role:"accountant"|"accounting_manager",id:number)=>({user:{id,name:`test-${id}`,role},req:{ip:"127.0.0.1",headers:{}},res:{}}as any);
  const maker=depreciationRouter.createCaller(context("accountant",1)),reviewer=depreciationRouter.createCaller(context("accounting_manager",2));
  const policy=await maker.savePolicy({effectiveDate:"2026-05-01",payload:{organizationName:"معزول",currency:"SAR",fiscalStartMonth:1,openingDate:"2026-05-01",capitalizationThreshold:"0",partialMonth:"ACTUAL_DAYS",rules:[{classificationId:1,treatment:"DEPRECIABLE",lifeMonths:60,residualPercent:"0",expenseName:"مصروف إهلاك الأثاث",accumulatedName:"مجمع إهلاك الأثاث",costName:"الأثاث"}]}});
  await maker.submitDocument({kind:"policy",id:policy.id!,expectedVersion:0});await reviewer.approveDocument({kind:"policy",id:policy.id!,expectedVersion:1});
  const batch=await maker.saveBatch({entityType:"asset",entityId:1,classificationId:1,policyId:policy.id!,payload:{label:"دفعة",quantity:2,unitCost:"6000",unitResidual:"0",openingAccumulated:"0",openingImpairment:"0",recognitionDate:"2026-05-01",availableForUseDate:"2026-05-01",balanceDate:"2026-05-01",lifeMonths:60,documentReference:"TEST",units:["T1","T2"],allocation:{costCenter:"CC",location:"L",branch:"",department:""},notes:""}});
  await maker.submitDocument({kind:"batch",id:batch.id!,expectedVersion:0});await reviewer.approveDocument({kind:"batch",id:batch.id!,expectedVersion:1});
  const period=await maker.savePeriod({month:"2026-05"});await maker.submitPeriod({id:period.id,expectedVersion:0});
  const outcomes=await Promise.allSettled([reviewer.approvePeriod({id:period.id,expectedVersion:1}),reviewer.approvePeriod({id:period.id,expectedVersion:1})]);assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);assert.equal(outcomes.filter(r=>r.status==="rejected").length,1);
  const[journals]=await isolated.query<any[]>("SELECT COUNT(*) n FROM depreciation_journals");assert.equal(Number(journals[0].n),1);
  const report=await maker.report({from:"2026-05-01",to:"2026-05-31"});assert.equal(report.total.charge,"200.00");assert.equal(report.total.net,"11800.00");assert.equal(report.reconciled,true);
  await maker.exportJournals({from:"2026-05-01",to:"2026-05-31"});
  console.log("PASS: isolated MySQL/TiDB transactions, simultaneous approval (one success), one balanced journal, reconciliation and Excel export.");
 }finally{await isolated.end();}
}catch(error:any){console.error("Isolated depreciation database test failed:",error?.code??error?.name,error?.message);process.exitCode=1;}
finally{
 try{const db:any=await getDb();await db?.$client?.end();}catch{}
 if(created)await admin.query(`DROP DATABASE \`${schemaName}\``);
 await admin.end();
 process.env.DATABASE_URL=original;
}
process.exit(process.exitCode??0);
