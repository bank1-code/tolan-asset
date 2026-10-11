// Read-only confirmation that negative UI tests did not post financial effects.
import 'dotenv/config';import mysql from 'mysql2/promise';import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',checks=[],check=(key,pass)=>checks.push({key,pass});
const ui=JSON.parse(readFileSync(`${root}/financial-negative-ui-observed.json`,'utf8'));
for(const c of ui.cases)check(`${c.case}: visible rejection or native required field`,Boolean(c.message));
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
let observed;
try{
 const [movements]=await db.query('SELECT m.*,u.username creator FROM depreciation_movements m LEFT JOIN users u ON u.id=m.createdBy ORDER BY m.id');
 const drafts=movements.filter(m=>m.status==='DRAFT'),approved=movements.filter(m=>m.status==='APPROVED');
 check('Exactly nine previously approved movements',approved.length===9&&approved.every(m=>m.id<=9));
 check('One deliberately invalid draft, prepared by accountant',drafts.length===1&&drafts[0].id===10&&drafts[0].creator==='qa_accountant');
 const [journals]=await db.query('SELECT id,code,movementId FROM depreciation_journals WHERE movementId=10');
 check('No journal for invalid draft',journals.length===0);
 const [audits]=await db.query("SELECT actionType FROM audit_log WHERE tableName='depreciation_movements' AND recordId=10");
 check('Invalid draft never submitted or approved',audits.length>0&&audits.every(a=>['FINANCE_DRAFT','FINANCE_EDIT'].includes(a.actionType)));
 const decode=v=>typeof v==='string'?JSON.parse(v):v;
 const stale=JSON.parse(readFileSync(`${root}/stale-draft-ui-observed.json`,'utf8'));
 check('Stale browser version explicitly rejected',stale.rejection.includes('تغير السجل؛ حدّث الشاشة قبل المتابعة'));
 check('Most recent draft note preserved',decode(drafts[0].payload).reason.startsWith('QA-STALE-A:')&&!decode(drafts[0].payload).reason.includes('QA-STALE-B:'));
 check('Rejected attempts created no extra draft or edit version',drafts[0].version===4&&audits.filter(a=>a.actionType==='FINANCE_DRAFT').length===1&&audits.filter(a=>a.actionType==='FINANCE_EDIT').length===4);
 observed={drafts:drafts.map(m=>({id:m.id,status:m.status,version:m.version,kind:m.kind,effectiveDate:m.effectiveDate,creator:m.creator,payload:decode(m.payload)})),approvedMovementCount:approved.length,journalsForInvalidDraft:0};
}finally{await db.end();}
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,observed,checks};writeFileSync(`${root}/financial-negative-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,observed:undefined,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
