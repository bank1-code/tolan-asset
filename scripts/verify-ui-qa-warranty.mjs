import 'dotenv/config';import mysql from 'mysql2/promise';import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',cases=JSON.parse(readFileSync(`${root}/lifecycle-cases.json`,'utf8')).cases.filter(c=>c.case.startsWith('WARRANTY'));
const decode=p=>typeof p==='string'?JSON.parse(p):p;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [requests]=await db.query('SELECT w.*,u.username AS creator,a.username AS executor FROM warranty_replacements w LEFT JOIN users u ON u.id=w.createdBy LEFT JOIN users a ON a.id=w.executedBy ORDER BY w.id');
 const [assets]=await db.query('SELECT id,assetCode AS code,assetName AS name,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue,classificationId,assignedTo,departmentId,locationId FROM assets');
 const [custody]=await db.query('SELECT id,code,name,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue,classificationId,assignedTo,departmentId,locationId FROM custody_items');
 const checks=[],observed=[];const check=(key,name,ok)=>checks.push({key,name,passed:Boolean(ok)});
 for(const c of cases){const matches=requests.filter(r=>r.entityType===c.fixture.entityType&&r.entityId===c.operational.id&&decode(r.payload).originalSerialNumbers.join('|')===c.originalUnits.join('|'));
  if(!matches.length)continue;check(c.case,'One matching request',matches.length===1);const r=matches[0],p=decode(r.payload),s=decode(r.sourceSnapshot),records=r.entityType==='asset'?assets:custody,source=records.find(s=>s.id===r.entityId);
  check(c.case,'Accountant created request',r.creator==='qa_accountant');check(c.case,'Exact source and quantity',p.entityId===c.operational.id&&p.quantity===c.quantity);
  check(c.case,'Document stored on request',p.documents.length===1&&p.documents[0].name==='qa-warranty-claims.pdf');
  check(c.case,'Preserved cost and identity',s.entityCode===c.operational.code&&String(s.assetValue)===c.fixture.unitCost);
  if(r.status==='EXECUTED'){
   const replacement=records.find(s=>s.id===r.replacementEntityId),execution=decode(r.executionSnapshot);
   check(c.case,'Different manager executed approval',r.executor==='qa_finance_manager'&&r.executedBy!==r.createdBy);
   check(c.case,'Exact replacement identifiers and dates',p.replacementSerialNumbers.join('|')===c.replacementUnits.join('|')&&p.effectiveDate===c.effectiveDate&&p.incidentDate===c.incidentDate);
   check(c.case,'Replacement cost, quantity and classification retained',replacement&&replacement.assetValue===c.fixture.unitCost&&replacement.quantity===c.quantity&&replacement.classificationId===source.classificationId);
   check(c.case,'New unique official replacement code',replacement&&replacement.code!==source.code&&records.filter(s=>s.code===replacement.code).length===1);
   check(c.case,'Exact source balance and status',source.warrantyReplacedQuantity===c.quantity&&source.quantity===c.fixture.quantity&&source.status===(c.quantity===c.fixture.quantity?'REPLACED':'ACTIVE'));
   check(c.case,'Current assignment retained by replacement',replacement&&['assignedTo','departmentId','locationId'].every(k=>replacement[k]===source[k]));
   check(c.case,'Execution is numbered and immutable snapshot exists',r.operationCode&&execution&&execution.replacementEntityId===r.replacementEntityId);
  }else{
   check(c.case,'Draft/submitted request does not change operational source',source.status==='ACTIVE'&&source.warrantyReplacedQuantity===0&&source.quantity===c.fixture.quantity);
   check(c.case,'No replacement or official code before execution',!r.operationCode&&!r.replacementEntityId&&!r.executionSnapshot);
  }
  observed.push({case:c.case,id:r.id,status:r.status,version:r.version,entityId:r.entityId,replacementEntityId:r.replacementEntityId,operationCode:r.operationCode,creator:r.creator,executor:r.executor});
 }
 if(process.argv.includes('--require-complete'))check('ALL','Two UI warranty cases saved',observed.length===2);
 if(process.argv.includes('--require-executed'))check('ALL','Both cases manager executed',observed.length===2&&observed.every(r=>r.status==='EXECUTED'));
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed};
 writeFileSync(`${root}/warranty-workflow-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
