// Verify rendered browser table values against the independent baseline.
import {readFileSync,writeFileSync} from 'node:fs';
const dir='qa-results/ui-full-cycle';
const plan=JSON.parse(readFileSync(`${dir}/planned-data.json`,'utf8'));
const baseline=JSON.parse(readFileSync(`${dir}/baseline-expected.json`,'utf8'));
const path=process.argv[2]||`${dir}/report-2025-01-ui-observed.json`;
const actual=JSON.parse(readFileSync(path,'utf8'));
const filters=actual.filters||{};
const operational=JSON.parse(readFileSync(`${dir}/operational-approval-verification.json`,'utf8')).observed;
const fixtureByKey=new Map(plan.records.map(r=>[r.key,r]));
const includedUnits=r=>{
 const fixture=fixtureByKey.get(r.key);
 if(filters.entityType&&fixture.entityType!==filters.entityType)return 0;
 if(filters.classificationCode&&fixture.classificationCode!==filters.classificationCode)return 0;
 for(const [field,list,key] of [['location','locations','locationKey'],['branch','branches','branchKey'],['department','departments','departmentKey'],['costCenter','departments','departmentKey']]){
  if(filters[field]&&plan[list].find(x=>x.key===fixture[key])?.name!==filters[field])return 0;
 }
 const identity=operational.find(x=>x.key===r.key);
 return fixture.units.filter(unit=>!filters.search||`${identity?.code||''} ${fixture.name} ${unit}`.toLowerCase().includes(filters.search.toLowerCase())).length;
};
const dates=actual.title.match(/\d{2}\/\d{2}\/\d{4}/g)||[];
const iso=d=>d.split('/').reverse().join('-');
const from=dates[0]&&iso(dates[0]),to=dates[1]&&iso(dates[1]);
const fromMonth=from?.slice(0,7),toMonth=to?.slice(0,7);
const closing=baseline.months.find(m=>m.month===toMonth);
const previous=baseline.months.filter(m=>m.month<fromMonth).at(-1);
const selected=baseline.months.filter(m=>m.month>=fromMonth&&m.month<=toMonth);
if(!closing||!from.endsWith('-01')||to!==closing.to)throw Error('Report must cover complete baseline months');
const cents=v=>{const [a,b='']=String(v).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const checks=[];const check=(key,name,ok)=>checks.push({key,name,passed:Boolean(ok)});
const fields=['openingCost','additions','costAdjustments','removedCost','closingCost','openingAccum','carriedAccum','charge','accumAdjustments','removedAccum','closingAccum','closingImpairment','net'];
check('REPORT','13 monetary columns plus classification',actual.headers.length===14);
const expectedClasses=plan.classifications.filter(c=>closing.rows.some(r=>r.classificationCode===c.code&&includedUnits(r)>0&&cents(r.cost)>0n));
check('REPORT','Expected classifications and no extra groups',actual.rows.length===expectedClasses.length&&actual.rows.every(r=>expectedClasses.some(c=>c.name===r[0])));
const sum=(month,code,field)=>month?.rows.filter(r=>r.classificationCode===code).reduce((n,r)=>{
 const qty=BigInt(fixtureByKey.get(r.key).quantity),units=BigInt(includedUnits(r)),value=cents(r[field]);
 if(value%qty!==0n)throw Error(`Oracle amount does not divide exactly per unit: ${r.key}/${field}`);
 return n+value/qty*units;
},0n)||0n;
for(const c of expectedClasses){const row=actual.rows.find(r=>r[0]===c.name);check(c.code,'Classification visible exactly once',row&&actual.rows.filter(r=>r[0]===c.name).length===1);if(!row)continue;
 const openingCost=sum(previous,c.code,'cost'),closingCost=sum(closing,c.code,'cost');
 const expected={openingCost,additions:closingCost-openingCost,costAdjustments:0n,removedCost:0n,closingCost,openingAccum:sum(previous,c.code,'closingAccumulated'),carriedAccum:0n,charge:selected.reduce((n,m)=>n+sum(m,c.code,'charge'),0n),accumAdjustments:0n,removedAccum:0n,closingAccum:sum(closing,c.code,'closingAccumulated'),closingImpairment:0n,net:sum(closing,c.code,'net')};
 for(const [i,field] of fields.entries())check(c.code,field,cents(row[i+1])===expected[field]);
}
const failed=checks.filter(c=>!c.passed);const result={checkedAt:new Date().toISOString(),source:'Rendered application table',sourceDatabaseModified:false,from,to,filters,status:failed.length?'FAIL':'PASS',checked:checks.length,failed};
writeFileSync(path.replace('-ui-observed.json','-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
