import 'dotenv/config';
import mysql from 'mysql2/promise';
import { writeFileSync } from 'node:fs';
const decode=x=>typeof x==='string'?JSON.parse(x):x;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try {
 const [[record]]=await db.query('SELECT * FROM asset_exclusions WHERE exclusionCode=?',['EXC-2026-0001']);
 const [files]=await db.query('SELECT f.*,u.username FROM exclusion_attachments f JOIN users u ON u.id=f.createdBy WHERE f.exclusionId=?',[record.id]);
 const [audits]=await db.query("SELECT * FROM audit_log WHERE (tableName='asset_exclusions' AND recordId=?) OR (tableName='exclusion_attachments' AND recordId IN (SELECT id FROM exclusion_attachments WHERE exclusionId=?))",[record.id,record.id]);
 const checks=[],check=(name,ok)=>checks.push({name,passed:!!ok});
 check('Original exclusion quantities and effective date retained',record.quantityExcluded===3&&record.quantityBefore===10&&record.quantityRemaining===7&&record.effectiveDate==='2026-10-07');
 check('Original image and two responsible persons retained',decode(record.exclusionImages).length===1&&decode(record.responsibleData).length===2);
 check('Exactly one original execution audit retained',audits.filter(a=>a.tableName==='asset_exclusions'&&a.actionType==='EXCLUDE').length===1);
 check('Exactly one later PDF attachment',files.length===1&&files[0].fileName==='qa-warranty-claims.pdf'&&files[0].contentType==='application/pdf'&&files[0].url.startsWith('/api/files/documents/exclusion/'));
 check('Later attachment records manager and time',files[0]?.username==='qa_finance_manager'&&files[0].createdByName==='مدير الحسابات'&&files[0].createdAt>record.createdAt);
 check('One independent attachment audit with same actor and source',audits.filter(a=>a.tableName==='exclusion_attachments'&&a.recordId===files[0]?.id&&a.actionType==='ATTACH'&&a.performedBy===files[0].createdBy&&decode(a.newData).exclusionId===record.id&&decode(a.newData).entityId===record.entityId).length===1);
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,checks,failed};
 writeFileSync('qa-results/ui-full-cycle/later-attachment-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
