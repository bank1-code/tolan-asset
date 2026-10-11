import "dotenv/config";
import {writeFileSync} from "node:fs";
import * as XLSX from "xlsx";
import {appRouter} from "../server/routers";
const qaAtomicity:any={checks:[]};
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
const admin=await mysql.createPool({uri:original,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true},connectionLimit:2,maxIdle:1,idleTimeout:30000});
let created=false;
try {
 await admin.query(`CREATE DATABASE \`${schemaName}\``);created=true;
 const [tableRows]=await admin.query<any[]>("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
 const definitions:string[]=[];
 for(const row of tableRows){const table=String(Object.values(row)[0]);if(!/^[a-zA-Z0-9_]+$/.test(table))throw new Error("Unsafe table name");const[definition]=await admin.query<any[]>(`SHOW CREATE TABLE \`${table}\``);definitions.push(String(definition[0]["Create Table"]).replace(/^\s*CONSTRAINT[^\n]+FOREIGN KEY[^\n]*\n?/gm,"").replace(/,\s*\)/g,"\n)").replace(/\/\*T!\[[^\]]+\][\s\S]*?\*\//g,""));}
 const target=new URL(original);target.pathname=`/${schemaName}`;process.env.DATABASE_URL=target.toString();
 const isolated=await mysql.createPool({uri:target.toString(),ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true},connectionLimit:2,maxIdle:1,idleTimeout:30000});
 try {
  for(const definition of definitions)await isolated.query(definition);
  await isolated.query("INSERT INTO depreciation_control(id,revision) VALUES(1,0)");
  await isolated.query("INSERT INTO users(id,openId,name,role) VALUES(1,'test-maker','محاسب الاختبار','accountant'),(2,'test-reviewer','مدير الاختبار','accounting_manager')");
  await isolated.query("INSERT INTO financial_classifications(id,code,name,active) VALUES(1,'F','أثاث',1)");
  await isolated.query("INSERT INTO assets(id,assetName,assetCode,quantity,status,classificationId) VALUES(1,'أثاث','TEST-A1',2,'ACTIVE',1)");
  const context=(role:"accountant"|"accounting_manager",id:number)=>({user:{id,name:`test-${id}`,role},req:{ip:"127.0.0.1",headers:{}},res:{}}as any);
  const maker=depreciationRouter.createCaller(context("accountant",1)),reviewer=depreciationRouter.createCaller(context("accounting_manager",2));
  const badCreator=appRouter.createCaller({...context("accountant",1),user:{id:1,role:"accountant",name:"X".repeat(300)}});
  const [beforeCreate]=await isolated.query<any[]>("SELECT COUNT(*) n FROM assets");let createError:any;try{await badCreator.inventory.assets.create({assetName:"QA audit SQL fault",quantity:1,assetValue:"10",classificationId:1});}catch(e){createError=e;}assert.ok(createError);const [afterCreate]=await isolated.query<any[]>("SELECT COUNT(*) n FROM assets");assert.equal(afterCreate[0].n,beforeCreate[0].n);qaAtomicity.checks.push({name:"تراجع إنشاء الأصل عند فشل التدقيق SQL",status:"PASS",evidence:{before:beforeCreate[0].n,after:afterCreate[0].n,errorCode:createError.code}});
  const policy=await maker.savePolicy({effectiveDate:"2026-05-01",payload:{organizationName:"معزول",currency:"SAR",fiscalStartMonth:1,openingDate:"2026-05-01",capitalizationThreshold:"0",partialMonth:"ACTUAL_DAYS",rules:[{classificationId:1,treatment:"DEPRECIABLE",lifeMonths:60,residualPercent:"0",expenseName:"مصروف إهلاك الأثاث",accumulatedName:"مجمع إهلاك الأثاث",costName:"الأثاث"}]}});
  await maker.submitDocument({kind:"policy",id:policy.id!,expectedVersion:0});await reviewer.approveDocument({kind:"policy",id:policy.id!,expectedVersion:1});
  const batch=await maker.saveBatch({entityType:"asset",entityId:1,classificationId:1,policyId:policy.id!,payload:{label:"دفعة",quantity:2,unitCost:"6000",unitResidual:"0",openingAccumulated:"0",openingImpairment:"0",recognitionDate:"2026-05-01",availableForUseDate:"2026-05-01",balanceDate:"2026-05-01",lifeMonths:60,documentReference:"TEST",units:["T1","T2"],allocation:{costCenter:"CC",location:"L",branch:"",department:""},notes:""}});
  await maker.submitDocument({kind:"batch",id:batch.id!,expectedVersion:0});await reviewer.approveDocument({kind:"batch",id:batch.id!,expectedVersion:1});
  const period=await maker.savePeriod({month:"2026-05"});await maker.submitPeriod({id:period.id,expectedVersion:0});
  const badReviewer=depreciationRouter.createCaller({...context("accounting_manager",2),user:{id:2,role:"accounting_manager",name:"X".repeat(300)}});let approvalError:any;try{await badReviewer.approvePeriod({id:period.id,expectedVersion:1});}catch(e){approvalError=e;}assert.ok(approvalError);const [failedPeriod]=await isolated.query<any[]>("SELECT status,version FROM depreciation_periods WHERE id=?",[period.id]),[failedJournals]=await isolated.query<any[]>("SELECT COUNT(*) n FROM depreciation_journals WHERE periodId=?",[period.id]);assert.equal(failedPeriod[0].status,"SUBMITTED");assert.equal(failedPeriod[0].version,1);assert.equal(Number(failedJournals[0].n),0);qaAtomicity.checks.push({name:"تراجع القيد واعتماد الشهر عند فشل التدقيق SQL",status:"PASS",evidence:{status:failedPeriod[0].status,version:1,journalsCreated:0,errorCode:approvalError.code}});
  const outcomes=await Promise.allSettled([reviewer.approvePeriod({id:period.id,expectedVersion:1}),reviewer.approvePeriod({id:period.id,expectedVersion:1})]);assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1);assert.equal(outcomes.filter(r=>r.status==="rejected").length,1);
  const[journals]=await isolated.query<any[]>("SELECT COUNT(*) n FROM depreciation_journals");assert.equal(Number(journals[0].n),1);
  const report=await maker.report({from:"2026-05-01",to:"2026-05-31"});assert.equal(report.total.charge,"200.00");assert.equal(report.total.net,"11800.00");assert.equal(report.reconciled,true);
  await maker.exportJournals({from:"2026-05-01",to:"2026-05-31"});
  qaAtomicity.checks.push({name:"اعتمادان متزامنان بعد التراجع ينتجان قيداً متوازناً واحداً",status:"PASS",evidence:{successes:1,rejections:1,journals:1,expense:"200.00"}});
  const [departments]=await admin.query<any[]>("SELECT * FROM departments WHERE branchId IS NOT NULL ORDER BY id LIMIT 1"),department=departments[0];
  const [branches]=await admin.query<any[]>("SELECT * FROM branches WHERE id=?",[department.branchId]),branch=branches[0], [locations]=await admin.query<any[]>("SELECT * FROM locations WHERE id=?",[branch.locationId]),location=locations[0],[employees]=await admin.query<any[]>("SELECT * FROM employees ORDER BY id LIMIT 1"),employee={...employees[0],nationalId:null,phone:null};
  for(const [table,row]of [["locations",location],["branches",branch],["departments",department],["employees",employee]]as const){await isolated.query(`INSERT INTO \`${table}\` SET ?`,row);}
  const appMaker=appRouter.createCaller(context("accountant",1)),appManager=appRouter.createCaller(context("accounting_manager",2)),template=await appMaker.excel.downloadTemplate({type:"assets"});
  const workbook=XLSX.read(template.base64,{type:"base64"}),grid:any[][]=XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1}),headers=grid[0];
  const rowFor=(title:string,classification="F")=>headers.map((h:string)=>({"اسم الأصل":title,"رمز التصنيف":classification,"التصنيف المالي":"أثاث","المستلم":employee.fullName,"القسم":department.name,"الفرع":branch.name,"الموقع":location.name,"الكمية":1,"قيمة الوحدة":1200,"الحالة":"جيد","الوضع":"نشط"}as Record<string,unknown>)[h]??"");
  const fileFor=(rows:any[][])=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,...rows]),"الأصول");return XLSX.write(wb,{type:"base64",bookType:"xlsx"});};
  const imported=await appMaker.excel.importAssets({base64Data:fileFor([rowFor("QA actual import 1"),rowFor("QA actual import 2")]),previewOnly:false});assert.equal(imported.imported,2,JSON.stringify(imported));assert.equal(imported.skipped,0);
  const [importedRows]=await isolated.query<any[]>("SELECT * FROM assets WHERE assetName LIKE 'QA actual import %' ORDER BY id");assert.equal(importedRows.length,2);assert.ok(importedRows.every((r:any)=>r.status==="DRAFT"&&r.classificationId===1&&r.departmentId===department.id&&r.locationId===location.id&&r.assignedTo===employee.id));qaAtomicity.checks.push({name:"استيراد Excel فعلي ينشئ مسودتين بالتصنيف والهيكل الحالي",status:"PASS",evidence:{imported:2,status:"DRAFT",classificationId:1}});
  const beforeInvalid=Number((await isolated.query<any[]>("SELECT COUNT(*) n FROM assets"))[0][0].n),invalid=await appMaker.excel.importAssets({base64Data:fileFor([rowFor("QA invalid classification","UNKNOWN")]),previewOnly:false});assert.equal(invalid.imported,0);assert.equal(invalid.skipped,1);assert.equal(Number((await isolated.query<any[]>("SELECT COUNT(*) n FROM assets"))[0][0].n),beforeInvalid);qaAtomicity.checks.push({name:"رمز تصنيف غير موجود في Excel لا ينشئ سجلاً",status:"PASS",evidence:{imported:0,skipped:1}});
  const numbered=await Promise.all(importedRows.map((r:any)=>appManager.inventory.assets.approve({id:r.id,expectedVersion:0})));assert.equal(new Set(numbered.map((r:any)=>r.code)).size,2);qaAtomicity.checks.push({name:"اعتماد أصلين متزامنين يولد رقمين مختلفين في الموقع نفسه",status:"PASS",evidence:{codes:numbered.map((r:any)=>r.code)}});
  writeFileSync("qa-results/repair-atomicity.json",JSON.stringify(qaAtomicity,null,2));
  console.log("PASS: isolated MySQL/TiDB transactions, simultaneous approval (one success), one balanced journal, reconciliation and Excel export.");
 }finally{await isolated.end();}
}catch(error:any){console.error("Isolated depreciation database test failed:",error?.code??error?.name,error?.message);process.exitCode=1;}
finally{
 try{const db:any=await getDb();await db?.$client?.end();}catch{}
 if(created)await admin.query(`DROP DATABASE \`${schemaName}\``);
 await admin.end();
 process.env.DATABASE_URL=original;
}
qaAtomicity.isolatedDatabaseRemoved=created;writeFileSync("qa-results/repair-atomicity.json",JSON.stringify(qaAtomicity,null,2));process.exit(process.exitCode??0);

