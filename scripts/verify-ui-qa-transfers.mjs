import 'dotenv/config';import mysql from 'mysql2/promise';import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',cases=JSON.parse(readFileSync(`${root}/lifecycle-cases.json`,'utf8')).cases.filter(c=>c.case.startsWith('TRANSFER')),plan=JSON.parse(readFileSync(`${root}/planned-data.json`,'utf8'));
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [rows]=await db.query('SELECT t.*,u.username FROM asset_transfers t LEFT JOIN users u ON u.id=t.transferredBy ORDER BY t.id');
 const [audits]=await db.query('SELECT recordId,performedBy,actionType FROM audit_log WHERE tableName=?',['asset_transfers']);
 const [entities]=await db.query("SELECT 'asset' AS entityType,a.id,a.quantity,a.excludedQuantity,a.warrantyReplacedQuantity,a.status,a.assetValue,e.fullName AS employeeName,d.name AS departmentName,l.name AS locationName FROM assets a LEFT JOIN employees e ON e.id=a.assignedTo LEFT JOIN departments d ON d.id=a.departmentId LEFT JOIN locations l ON l.id=a.locationId UNION ALL SELECT 'custody',a.id,a.quantity,a.excludedQuantity,a.warrantyReplacedQuantity,a.status,a.assetValue,e.fullName,d.name,l.name FROM custody_items a LEFT JOIN employees e ON e.id=a.assignedTo LEFT JOIN departments d ON d.id=a.departmentId LEFT JOIN locations l ON l.id=a.locationId");
 const checks=[],observed=[];const check=(key,name,ok)=>checks.push({key,name,passed:!!ok});
 for(const c of cases){const matches=rows.filter(r=>r.entityType===c.fixture.entityType&&r.entityId===c.operational.id);check(c.case,'Exactly one transfer',matches.length===1);if(matches.length!==1)continue;const t=matches[0],e=entities.find(e=>e.entityType===c.fixture.entityType&&e.id===c.operational.id),dest=c.fixture.entityType==='asset'?{d:'D2',l:'L2',emp:'EMP-011'}:{d:'D3',l:'L3',emp:'EMP-021'};
  check(c.case,'Accountant executed transfer',t.username==='qa_accountant');check(c.case,'Exact quantity and reference unit cost',t.quantity===c.quantity&&t.assetValue===c.fixture.unitCost);
  check(c.case,'Historical source names preserved',t.fromDepartment===plan.departments.find(x=>x.key===c.fixture.departmentKey).name&&t.fromLocation===plan.locations.find(x=>x.key===c.fixture.locationKey).name);
  check(c.case,'Exact destination on record and movement',t.toDepartment===plan.departments.find(x=>x.key===dest.d).name&&t.toLocation===plan.locations.find(x=>x.key===dest.l).name&&e.departmentName===t.toDepartment&&e.locationName===t.toLocation&&e.employeeName===plan.employees.find(x=>x.key===dest.emp).name);
  check(c.case,'Quantity/status/value retained',e.status==='ACTIVE'&&e.quantity===c.fixture.quantity&&e.assetValue===c.fixture.unitCost&&e.excludedQuantity===0&&e.warrantyReplacedQuantity===0);
  check(c.case,'Exactly one matching audit',audits.filter(a=>a.recordId===t.id&&a.actionType==='TRANSFER'&&a.performedBy===t.transferredBy).length===1);
  observed.push({case:c.case,id:t.id,entityId:t.entityId,quantity:t.quantity,fromLocation:t.fromLocation,toLocation:t.toLocation,toDepartment:t.toDepartment,toEmployee:e.employeeName,effectiveDate:t.transferredAt.slice(0,10)});
 }
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed};writeFileSync(`${root}/transfers-workflow-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
