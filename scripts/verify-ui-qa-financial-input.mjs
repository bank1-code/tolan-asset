// Read-only reconciliation of financial data entered through application pages.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
const dir='qa-results/ui-full-cycle';
const plan=JSON.parse(readFileSync(`${dir}/planned-data.json`,'utf8'));
const operational=JSON.parse(readFileSync(`${dir}/operational-approval-verification.json`,'utf8'));
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
const decode=p=>typeof p==='string'?JSON.parse(p):p;
const checks=[];const check=(key,name,ok)=>checks.push({key,name,passed:Boolean(ok)});
const cents=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
try {
 const [classes]=await db.query('SELECT id,code,name FROM financial_classifications');
 const [policies]=await db.query('SELECT p.*,u.username AS creator,a.username AS approver FROM depreciation_policies p LEFT JOIN users u ON u.id=p.createdBy LEFT JOIN users a ON a.id=p.approvedBy');
 check('POLICY','Exactly one policy',policies.length===1);
 const policy=policies[0];const payload=decode(policy?.payload);
 check('POLICY','Accountant prepared; manager approved',policy?.creator==='qa_accountant'&&policy?.approver==='qa_finance_manager'&&policy?.status==='APPROVED'&&policy?.approvedAt);
 for(const field of ['organizationName','currency','fiscalStartMonth','openingDate','partialMonth']) check('POLICY',field,String(payload?.[field])===String(plan.policy[field]));
 check('POLICY','Capitalization threshold',cents(payload.capitalizationThreshold)===cents(plan.policy.capitalizationThreshold));
 check('POLICY','Effective date',policy?.effectiveDate===plan.policy.effectiveDate);
 check('POLICY','Ten classification rules',payload?.rules?.length===10);
 for(const c of plan.classifications){const rule=payload?.rules?.find(r=>r.classificationId===classes.find(x=>x.code===c.code)?.id);for(const field of ['treatment','lifeMonths','residualPercent','expenseName','accumulatedName','costName']) check(c.code,field,String(rule?.[field])===String(c[field]));}
 const [batches]=await db.query('SELECT b.*,u.username AS creator,a.username AS approver FROM depreciation_batches b LEFT JOIN users u ON u.id=b.createdBy LEFT JOIN users a ON a.id=b.approvedBy ORDER BY b.id');
 const observed=[];
 for(const batch of batches){const p=decode(batch.payload);const key=String(p.label).split(' | ')[0];const expected=plan.records.find(r=>r.key===key);check(key,'Known unique fixture',expected&&!observed.some(r=>r.key===key));if(!expected)continue;
  const master=operational.observed.find(r=>r.key===key);
  check(key,'Correct operational record',batch.entityType===expected.entityType&&batch.entityId===master.id);
  check(key,'Classification and policy',batch.policyId===policy.id&&batch.classificationId===classes.find(c=>c.code===expected.classificationCode)?.id);
  check(key,'Accountant created financial draft',batch.creator==='qa_accountant');
  check(key,'Draft or separate manager approval',batch.status==='DRAFT'&&!batch.approvedBy||batch.status==='SUBMITTED'&&!batch.approvedBy||batch.status==='APPROVED'&&batch.approver==='qa_finance_manager');
  for(const field of ['quantity','lifeMonths','recognitionDate','availableForUseDate','balanceDate','documentReference'])check(key,field,String(p[field])===String(expected[field]));
  for(const field of ['unitCost','unitResidual'])check(key,field,cents(p[field])===cents(expected[field]));
  check(key,'Zero opening balances',cents(p.openingAccumulated)===0n&&cents(p.openingImpairment)===0n);
  check(key,'Exact unique unit identifiers',JSON.stringify(p.units)===JSON.stringify(expected.units)&&new Set(p.units).size===expected.quantity);
  for(const [field,list,keyField] of [['location','locations','locationKey'],['branch','branches','branchKey'],['department','departments','departmentKey']]) check(key,field,p.allocation[field]===plan[list].find(x=>x.key===expected[keyField]).name);
  check(key,'Cost center',p.allocation.costCenter===plan.departments.find(x=>x.key===expected.departmentKey).name);
  observed.push({key,id:batch.id,status:batch.status,entityType:batch.entityType,entityId:batch.entityId,version:batch.version});
 }
 if(process.argv.includes('--require-complete'))check('BATCHES','200 financial files',observed.length===200);
 const failed=checks.filter(c=>!c.passed);const result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,checked:checks.length,failed,status:failed.length?'FAIL':'PASS_OBSERVED',policyId:policy?.id,observed,missing:plan.records.filter(r=>!observed.some(b=>b.key===r.key)).map(r=>r.key)};
 writeFileSync(`${dir}/financial-input-verification.json`,JSON.stringify(result,null,2));
 console.log(JSON.stringify({status:result.status,checked:checks.length,failed,files:observed.length,missing:result.missing.length,policyId:policy?.id}));if(failed.length)process.exitCode=1;
}finally{await db.end();}
