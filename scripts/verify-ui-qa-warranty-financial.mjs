// Read-only database evidence, with an independent rational straight-line oracle.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle';
const cases=JSON.parse(readFileSync(`${root}/lifecycle-cases.json`,'utf8')).cases.filter(c=>c.case.startsWith('WARRANTY'));
const operational=JSON.parse(readFileSync(`${root}/warranty-workflow-verification.json`,'utf8')).observed;
const plan=JSON.parse(readFileSync(`${root}/planned-data.json`,'utf8'));
const decode=p=>typeof p==='string'?JSON.parse(p):p;
const cents=v=>BigInt(String(v).replace('.',''));
const amount=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
const gcd=(a,b)=>b?gcd(b,a%b):a;
function accumulated(f,to){
 let n=0n,d=1n;
 for(let m=f.availableForUseDate.slice(0,7);m<=to.slice(0,7);){
  const [y,k]=m.split('-').map(Number),first=`${m}-01`,last=new Date(Date.UTC(y,k,0)).toISOString().slice(0,10);
  const from=f.availableForUseDate>first?f.availableForUseDate:first,end=to<last?to:last;
  if(from<=end){const days=BigInt((Date.parse(end)-Date.parse(from))/86400000+1),md=BigInt(last.slice(-2));n=n*md+days*d;d*=md;const g=gcd(n,d);n/=g;d/=g;}
  m=new Date(Date.UTC(y,k,1)).toISOString().slice(0,7);
 }
 const base=cents(f.unitCost)-cents(f.unitResidual),den=d*BigInt(f.lifeMonths),v=(base*n+den/2n)/den;
 return v>base?base:v;
}
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [movements]=await db.query('SELECT m.*,u.username AS creator,a.username AS approver FROM depreciation_movements m LEFT JOIN users u ON u.id=m.createdBy LEFT JOIN users a ON a.id=m.approvedBy WHERE m.kind=?',['WARRANTY']);
 const [batches]=await db.query('SELECT b.* FROM depreciation_batches b');
 const [journals]=await db.query('SELECT j.* FROM depreciation_journals j WHERE j.kind=?',['WARRANTY']);
 const checks=[],observed=[];const check=(key,name,ok)=>checks.push({key,name,passed:!!ok});
 for(const c of cases){
  const op=operational.find(o=>o.case===c.case),matches=movements.filter(m=>m.sourceKey===`warranty:${op.id}`);
  check(c.case,'Exactly one financial review per operational request',matches.length===1);if(matches.length!==1)continue;
  const m=matches[0],p=decode(m.payload),life=c.fixture.entityType==='asset'?16:18;
  const prior=new Date(Date.parse(c.effectiveDate)-86400000).toISOString().slice(0,10),accum=accumulated(c.fixture,prior);
  check(c.case,'Accountant prepared financial movement',m.creator==='qa_accountant');
  check(c.case,'Exact units, date and linked original batch',m.batchId===c.financial.id&&m.effectiveDate===c.effectiveDate&&p.units.join('|')===c.originalUnits.join('|'));
  check(c.case,'Replacement identity and explicitly reviewed remaining life',p.replacement.entityId===op.replacementEntityId&&p.replacement.remainingLifeMonths===life&&p.replacement.units.join('|')===c.replacementUnits.join('|'));
  const children=batches.filter(b=>decode(b.payload).sourceMovementId===m.id),js=journals.filter(j=>j.movementId===m.id);
  if(m.status==='APPROVED'){
   check(c.case,'Separate accounting manager approval',m.approver==='qa_finance_manager'&&m.approvedBy!==m.createdBy);
   check(c.case,'One carried batch for each replaced unit',children.length===c.quantity);
   for(let i=0;i<c.quantity;i++){
    const b=children.find(b=>decode(b.payload).units[0]===c.replacementUnits[i]),bp=b&&decode(b.payload);
    check(c.case,`Unit ${i+1} exact independent carried balance`,bp&&bp.unitCost===c.fixture.unitCost&&bp.openingAccumulated===amount(accum)&&bp.openingImpairment==='0.00'&&bp.unitResidual===c.fixture.unitResidual);
    check(c.case,`Unit ${i+1} dates/life/classification/status`,bp&&b.status==='APPROVED'&&b.entityId===op.replacementEntityId&&b.classificationId===batches.find(b=>b.id===c.financial.id).classificationId&&bp.balanceDate===c.effectiveDate&&bp.recognitionDate===c.fixture.recognitionDate&&bp.availableForUseDate===c.effectiveDate&&bp.lifeMonths===life);
    check(c.case,`Unit ${i+1} allocation retained`,bp&&bp.allocation.location===plan.locations.find(x=>x.key===c.fixture.locationKey).name&&bp.allocation.branch===plan.branches.find(x=>x.key===c.fixture.branchKey).name&&bp.allocation.department===plan.departments.find(x=>x.key===c.fixture.departmentKey).name&&bp.allocation.costCenter===plan.departments.find(x=>x.key===c.fixture.departmentKey).name);
   }
   check(c.case,'Exactly one warranty journal',js.length===1);
   for(const j of js){const s=decode(j.snapshot),dr=s.lines.reduce((n,l)=>n+cents(l.debit),0n),cr=s.lines.reduce((n,l)=>n+cents(l.credit),0n);
    check(c.case,'Balanced journal with exact gross cost and accumulated carry',dr===cr&&dr===(cents(c.fixture.unitCost)+accum)*BigInt(c.quantity));
    check(c.case,'Warranty carries value without profit/loss',s.lines.every(l=>!/(أرباح|خسائر|مصروف)/.test(l.account)));
    check(c.case,'Journal effective date and unique official code',j.effectiveDate===c.effectiveDate&&journals.filter(x=>x.code===j.code).length===1);
   }
  }else check(c.case,'No posted financial effects before approval',children.length===0&&js.length===0);
  observed.push({case:c.case,movementId:m.id,status:m.status,priorDay:prior,independentAccumulatedPerUnit:amount(accum),costPerUnit:c.fixture.unitCost,remainingLifeMonths:life,replacementBatchIds:children.map(b=>b.id),journalCodes:js.map(j=>j.code)});
 }
 if(process.argv.includes('--require-approved'))check('ALL','Both warranty financial movements approved',observed.length===2&&observed.every(o=>o.status==='APPROVED'));
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,oracle:'Independent rational arithmetic; no production calculation imports',status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,failed,observed};
 writeFileSync(`${root}/warranty-financial-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
}finally{await db.end();}
