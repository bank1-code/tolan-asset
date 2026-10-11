import 'dotenv/config';import mysql from 'mysql2/promise';import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',cases=JSON.parse(readFileSync(`${root}/lifecycle-cases.json`,'utf8')).cases.filter(c=>c.case.startsWith('EXCLUSION')),decode=p=>typeof p==='string'?JSON.parse(p):p;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [rows]=await db.query('SELECT e.*,u.username FROM asset_exclusions e LEFT JOIN users u ON u.id=e.excludedBy');
 const [drafts]=await db.query('SELECT * FROM exclusion_drafts');
 const [audits]=await db.query('SELECT recordId,performedBy,actionType FROM audit_log WHERE tableName=?',['asset_exclusions']);
 const [entities]=await db.query("SELECT 'asset' AS entityType,id,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue FROM assets UNION ALL SELECT 'custody',id,quantity,excludedQuantity,warrantyReplacedQuantity,status,assetValue FROM custody_items");
 const checks=[],observed=[];const check=(key,name,ok)=>checks.push({key,name,passed:!!ok});
 if(process.argv.includes('--no-executed')){const c=cases[0],e=entities.find(e=>e.entityType===c.fixture.entityType&&e.id===c.operational.id);check('NEGATIVE','No exclusion created by rejected dates',rows.length===0);check('NEGATIVE','Source quantity and status unchanged',e.quantity===10&&e.excludedQuantity===0&&e.status==='ACTIVE');check('NEGATIVE','Draft and image retained',drafts.length===1&&decode(drafts[0].payload).exclusionImages.length===1);}
 for(const c of cases){const matches=rows.filter(r=>r.entityType===c.fixture.entityType&&r.entityId===c.operational.id&&r.effectiveDate===c.effectiveDate);if(!matches.length)continue;check(c.case,'Exactly one execution',matches.length===1);const r=matches[0],all=rows.filter(r=>r.entityType===c.fixture.entityType&&r.entityId===c.operational.id),total=all.reduce((n,r)=>n+r.quantityExcluded,0),e=entities.find(e=>e.entityType===c.fixture.entityType&&e.id===c.operational.id);
  const previous=all.filter(x=>x.effectiveDate<r.effectiveDate).reduce((n,r)=>n+r.quantityExcluded,0);
  check(c.case,'Accountant execution',r.username==='qa_accountant');check(c.case,'Exact quantity before/excluded/remaining',r.originalQuantity===c.fixture.quantity&&r.previouslyExcluded===previous&&r.quantityBefore===c.fixture.quantity-previous&&r.quantityExcluded===c.quantity&&r.quantityRemaining===c.fixture.quantity-previous-c.quantity);
  check(c.case,'Full or partial derived from quantity',r.exclusionMode===(r.quantityRemaining===0?'full':'partial'));
  check(c.case,'Source balance and automatic status correct',e.quantity===c.fixture.quantity&&e.excludedQuantity===total&&e.status===(total===c.fixture.quantity?'EXCLUDED':'ACTIVE'));
  check(c.case,'Reference cost and identity snapshot preserved',r.originalUnitValue===c.fixture.unitCost&&r.entityCode===c.operational.code&&r.entityName===c.fixture.name&&!!r.entitySnapshot);
  check(c.case,'Responsible persons and stored image retained',decode(r.responsibleData).length===2&&decode(r.exclusionImages).length===1&&decode(r.exclusionImages)[0].startsWith('/api/files/'));
  check(c.case,'Unique official exclusion code',r.exclusionCode&&rows.filter(x=>x.exclusionCode===r.exclusionCode).length===1);
  check(c.case,'One transactional exclusion audit',audits.filter(a=>a.recordId===r.id&&a.performedBy===r.excludedBy&&a.actionType==='EXCLUDE').length===1);
  observed.push({case:c.case,id:r.id,code:r.exclusionCode,effectiveDate:r.effectiveDate,entityId:r.entityId,quantityBefore:r.quantityBefore,quantityExcluded:r.quantityExcluded,quantityRemaining:r.quantityRemaining,sourceStatus:e.status});
 }
 if(process.argv.includes('--require-complete')){check('ALL','All three UI exclusions executed',observed.length===3);check('ALL','Executed drafts consumed',drafts.length===0);}
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed,draftCount:drafts.length};writeFileSync(`${root}/exclusions-workflow-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
