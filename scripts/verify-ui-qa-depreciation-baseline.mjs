// Read-only check against independent rational arithmetic, not production formulas.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='qa-results/ui-full-cycle';
const reference=JSON.parse(readFileSync(`${dir}/baseline-expected.json`,'utf8'));
const files=JSON.parse(readFileSync(`${dir}/financial-input-verification.json`,'utf8'));
const decode=p=>typeof p==='string'?JSON.parse(p):p;
const cents=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const checks=[];const check=(month,name,ok)=>checks.push({month,name,passed:Boolean(ok)});
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try {
 const [periods]=await db.query('SELECT p.*,u.username AS creator,a.username AS approver FROM depreciation_periods p LEFT JOIN users u ON u.id=p.createdBy LEFT JOIN users a ON a.id=p.approvedBy ORDER BY p.month');
 const [journals]=await db.query('SELECT j.*,u.username AS approver FROM depreciation_journals j LEFT JOIN users u ON u.id=j.approvedBy ORDER BY j.id');
 const observed=[];
 for(const p of periods){const r=reference.months.find(x=>x.month===p.month);check(p.month,'Known baseline month',r);if(!r)continue;const s=decode(p.snapshot);
  check(p.month,'Accountant prepared period',p.creator==='qa_accountant');
  check(p.month,'Exact month boundaries',s.from===r.from&&s.to===r.to);
  check(p.month,'No readiness exceptions',s.exceptions.length===0);
  check(p.month,'Currency SAR',s.currency==='SAR');
  check(p.month,'Independent monthly expense total',cents(s.total)===cents(r.totals.charge));
  for(const row of r.rows){const file=files.observed.find(x=>x.key===row.key);const actual=s.lines.filter(l=>l.batchId===file.id).reduce((n,l)=>n+cents(l.debit),0n);check(p.month,`Exact expense ${row.key}`,actual===cents(row.charge));}
  const js=journals.filter(j=>j.periodId===p.id&&j.kind==='DEPRECIATION');
  if(['APPROVED','CLOSED'].includes(p.status)){
   check(p.month,'Separate manager approval',p.approver==='qa_finance_manager'&&p.approvedAt);
   check(p.month,'Exactly one journal',js.length===1);
   for(const j of js){const snapshot=decode(j.snapshot);const dr=snapshot.lines.reduce((n,l)=>n+cents(l.debit),0n),cr=snapshot.lines.reduce((n,l)=>n+cents(l.credit),0n);
    check(p.month,'Balanced journal matches independent total',dr===cr&&dr===cents(r.totals.charge));
    check(p.month,'Journal date and approver',j.effectiveDate===r.to&&j.approver==='qa_finance_manager');
    check(p.month,'Journal code unique',journals.filter(x=>x.code===j.code).length===1);
    check(p.month,'Journal source unique',journals.filter(x=>x.sourceKey===j.sourceKey).length===1);
   }
  }else check(p.month,'No posted journal for draft',js.length===0);
  observed.push({month:p.month,id:p.id,status:p.status,total:s.total,lines:s.lines.length,journalCodes:js.map(j=>j.code)});
 }
 if(process.argv.includes('--require-complete'))check('ALL','21 baseline periods',observed.length===21&&reference.months.every(r=>observed.some(p=>p.month===r.month)));
 if(process.argv.includes('--require-approved'))check('ALL','21 approved baseline periods',observed.length===21&&observed.every(p=>['APPROVED','CLOSED'].includes(p.status)));
 const failed=checks.filter(c=>!c.passed);const result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed,missing:reference.months.filter(r=>!observed.some(p=>p.month===r.month)).map(r=>r.month)};
 writeFileSync(`${dir}/depreciation-baseline-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checked:checks.length,failed,periods:observed.length,missing:result.missing.length,states:observed.reduce((a,p)=>{a[p.status]=(a[p.status]||0)+1;return a;},{}),draftMonths:observed.filter(p=>p.status==='DRAFT').map(p=>p.month)}));if(failed.length)process.exitCode=1;
}finally{await db.end();}
