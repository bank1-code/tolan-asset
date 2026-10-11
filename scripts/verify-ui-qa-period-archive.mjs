import 'dotenv/config';
import mysql from 'mysql2/promise';
import {writeFileSync} from 'node:fs';
const month=process.argv[2];if(!/^\d{4}-\d{2}$/.test(month||''))throw Error('Provide one QA period month');
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
const decode=p=>typeof p==='string'?JSON.parse(p):p;
const cents=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
try{
 const [[period]]=await db.query('SELECT id,status,snapshot FROM depreciation_periods WHERE month=?',[month]);
 if(!period||period.status!=='APPROVED')throw Error('The UI approval must complete before archive verification');
 const full=decode(period.snapshot),targets=new Set(full.lines.map(l=>`${l.entityType}:${l.entityId}`));
 const [[audit]]=await db.query("SELECT id FROM audit_log WHERE tableName='depreciation_periods' AND recordId=? AND actionType='DEPRECIATION_APPROVE' ORDER BY id DESC LIMIT 1",[period.id]);
 const [documents]=await db.query('SELECT entityType,assetId,custodyId,sourceKey,snapshot,OCTET_LENGTH(snapshot) AS snapshotBytes FROM archive_documents WHERE sourceKey LIKE ?',[`finance:${audit.id}:%`]);
 const checks=[];const check=(name,ok)=>checks.push({name,passed:Boolean(ok)});
 check('Exactly one immutable archive for each affected entity',documents.length===targets.size&&new Set(documents.map(d=>d.sourceKey)).size===targets.size);
 for(const d of documents){const entityId=d.entityType==='asset'?d.assetId:d.custodyId,s=decode(d.snapshot),p=s.newData,lines=p.snapshot.lines;
  check(`${d.sourceKey}: source scope and full-audit link`,p.archiveScope.fullAuditId===audit.id&&p.archiveScope.recordId===period.id&&p.archiveScope.periodTotal===full.total);
  check(`${d.sourceKey}: no unrelated entities`,lines.length>0&&lines.every(l=>l.entityType===d.entityType&&l.entityId===entityId));
  const expected=full.lines.filter(l=>l.entityType===d.entityType&&l.entityId===entityId);
  check(`${d.sourceKey}: exact historical details`,JSON.stringify(lines)===JSON.stringify(expected));
  check(`${d.sourceKey}: exact entity expense`,cents(p.snapshot.total)===expected.reduce((n,l)=>n+cents(l.debit),0n));
 }
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,month,status:failed.length?'FAIL':'PASS',checked:checks.length,failed,documents:documents.length,bytes:documents.reduce((n,d)=>n+Number(d.snapshotBytes),0),largestDocumentBytes:Math.max(...documents.map(d=>Number(d.snapshotBytes)))};
 writeFileSync(`qa-results/ui-full-cycle/archive-${month}-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
