import 'dotenv/config';import mysql from 'mysql2/promise';import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',cases=JSON.parse(readFileSync(`${root}/lifecycle-cases.json`,'utf8')).cases.filter(c=>c.case.startsWith('INVENTORY')),decode=p=>typeof p==='string'?JSON.parse(p):p;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [sessions]=await db.query('SELECT s.*,u.username AS creator,a.username AS approver FROM inventory_sessions s LEFT JOIN users u ON u.id=s.performedBy LEFT JOIN users a ON a.id=s.approvedBy');
 const [diffs]=await db.query('SELECT * FROM inventory_differences');
 const [entities]=await db.query("SELECT 'asset' AS entityType,id,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue FROM assets UNION ALL SELECT 'custody',id,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue FROM custody_items");
 const [batches]=await db.query('SELECT id,payload FROM depreciation_batches');
 const [movements]=await db.query('SELECT batchId FROM depreciation_movements');
 const checks=[],observed=[];const check=(key,name,ok)=>checks.push({key,name,passed:!!ok});
 check('ALL','Exactly one test session',sessions.length===1);
 for(const s of sessions){const p=decode(s.sessionData),items=Array.isArray(p)?p:p.items;const touched=items.filter(i=>i.actualQuantity!=null);check(s.id,'Accountant created draft',s.creator==='qa_accountant');check(s.id,'Exactly three counted records',touched.length===3);
  for(const c of cases){const matches=items.filter(i=>i.entityType===c.fixture.entityType&&i.id===c.operational.id),e=entities.find(e=>e.entityType===c.fixture.entityType&&e.id===c.operational.id);
   if(c.case==='INVENTORY_UNTOUCHED')check(c.case,'Untouched item remains blank in recoverable scope and never counted',matches.length===1&&matches[0].actualQuantity==null&&!touched.some(i=>i.id===c.operational.id&&i.entityType===c.fixture.entityType));
   else{check(c.case,'Exact counted quantity and snapshot',matches.length===1&&matches[0].actualQuantity===c.actualQuantity&&matches[0].expectedQuantity===c.fixture.quantity);if(c.actualQuantity!==c.fixture.quantity)check(c.case,'Reason recorded',!!matches[0]?.reason?.trim());}
   check(c.case,'No operational quantity/value adjustment',e&&e.quantity===c.fixture.quantity&&e.assetValue===c.fixture.unitCost&&e.status==='ACTIVE'&&e.excludedQuantity===0&&e.warrantyReplacedQuantity===0);
   const financial=batches.find(b=>b.id===c.financial.id),payload=financial&&decode(financial.payload);
   check(c.case,'Financial quantity/cost/units retained without adjustment movement',payload&&payload.quantity===c.fixture.quantity&&payload.unitCost===c.fixture.unitCost&&JSON.stringify(payload.units)===JSON.stringify(c.fixture.units)&&!movements.some(m=>m.batchId===c.financial.id));
  }
  const ds=diffs.filter(d=>d.sessionId===s.id);
  if(s.status==='APPROVED'){check(s.id,'Separate manager final approval',s.approver==='qa_finance_manager'&&s.approvedBy!==s.performedBy);check(s.id,'Exactly shortage and surplus differences',ds.length===2);for(const c of cases.filter(c=>c.actualQuantity!=null&&c.actualQuantity!==c.fixture.quantity)){const d=ds.find(d=>d.entityType===c.fixture.entityType&&d.entityId===c.operational.id);check(c.case,'Exact approved difference and reason',d&&d.expectedQuantity===c.fixture.quantity&&d.actualQuantity===c.actualQuantity&&d.difference===c.actualQuantity-c.fixture.quantity&&d.reason.trim());}}
  else check(s.id,'No final differences before approval',ds.length===0);
  if(s.status!=='DRAFT'){const summary=decode(s.scope).submissionSummary;check(s.id,'Only three counted records submitted; 198 retained only for recoverable scope',summary.submittedCount===3&&summary.unexaminedCount===198&&summary.scopeCount===201);}
  observed.push({id:s.id,status:s.status,version:s.version,storedItems:items.length,countedItems:touched.length,differenceRows:ds.length,creator:s.creator,approver:s.approver});
 }
 if(process.argv.includes('--require-approved'))check('ALL','Final manager approval',sessions.length===1&&sessions[0].status==='APPROVED');
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed};writeFileSync(`${root}/inventory-workflow-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
