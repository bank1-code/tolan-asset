// Independent oracle against actual rendered UI rows; no database writes or production imports.
import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const root='qa-results/ui-full-cycle',plan=JSON.parse(readFileSync(`${root}/planned-data.json`,'utf8')),ui=JSON.parse(readFileSync(`${root}/october-preview-ui-observed.json`,'utf8'));
const cents=v=>BigInt(String(v).replace('.','')),amount=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`,gcd=(a,b)=>b?gcd(b,a%b):a;
function elapsed(from,to){let n=0n,d=1n;for(let m=from.slice(0,7);m<=to.slice(0,7);){const[y,k]=m.split('-').map(Number),first=`${m}-01`,last=new Date(Date.UTC(y,k,0)).toISOString().slice(0,10),a=from>first?from:first,b=to<last?to:last;if(a<=b){const days=BigInt((Date.parse(b)-Date.parse(a))/86400000+1),md=BigInt(last.slice(-2));n=n*md+days*d;d*=md;const g=gcd(n,d);n/=g;d/=g;}m=new Date(Date.UTC(y,k,1)).toISOString().slice(0,7);}return{n,d};}
function cum(f,to){if(f.treatment!=='DEPRECIABLE')return 0n;const{n,d}=elapsed(f.availableForUseDate,to),base=cents(f.unitCost)-cents(f.unitResidual),den=d*BigInt(f.lifeMonths),v=(base*n+den/2n)/den;return v>base?base:v;}
const round=(n,d)=>(n+d/2n)/d;
assert.equal(cum({treatment:'DEPRECIABLE',unitCost:'1000.00',unitResidual:'0.00',lifeMonths:12,availableForUseDate:'2025-01-01'},'2025-01-31'),8333n);
const expected=[];
function push(unit,from,to,charge,loc,dept){if(charge!==0n)expected.push({unit,from,to,charge:amount(charge),costCenter:dept,allocation:`${loc} / ${dept}`});}
for(const f of plan.records){if(f.treatment!=='DEPRECIABLE')continue;const loc=plan.locations.find(x=>x.key===f.locationKey).name,dept=plan.departments.find(x=>x.key===f.departmentKey).name,opening=cum(f,'2026-09-30');
for(let i=0;i<f.units.length;i++){const unit=f.units[i];
 if((f.key==='QA-A-ITC-10'&&i<2)||f.key==='QA-C-ITC-01'){const asset=f.key==='QA-A-ITC-10',last=asset?'2026-10-04':'2026-10-05',ready=asset?'2026-10-05':'2026-10-06',life=asset?16n:18n,accum=cum(f,last);push(unit,'2026-10-01',last,accum-opening,loc,dept);const days=BigInt(32-Number(ready.slice(-2))),net=cents(f.unitCost)-accum-cents(f.unitResidual);push(`${unit}-W202610`,ready,'2026-10-31',round(net*days,life*31n),loc,dept);continue;}
 if(f.key==='QA-A-ELC-07'||f.key==='QA-C-TLS-03'){const last=f.key==='QA-A-ELC-07'?(i<3?'2026-10-06':'2026-10-08'):'2026-10-07';push(unit,'2026-10-01',last,cum(f,last)-opening,loc,dept);continue;}
 if(f.key==='QA-A-LAB-06'){push(unit,'2026-10-01','2026-10-31',round(cents(f.unitCost)-opening-20000n,36n),loc,dept);continue;}
 if(f.key==='QA-A-VEH-07'){push(unit,'2026-10-01','2026-10-31',round(8200000n-320000n-820000n,57n),loc,dept);continue;}
 if(f.key==='QA-A-FUR-06'||f.key==='QA-C-COM-04'){const asset=f.key==='QA-A-FUR-06',before=cum(f,'2026-10-10'),after=cum(f,'2026-10-31'),d=plan.departments.find(x=>x.key===(asset?'D2':'D3')).name,l=plan.locations.find(x=>x.key===(asset?'L2':'L3')).name;push(unit,'2026-10-01','2026-10-10',before-opening,loc,dept);push(unit,'2026-10-11','2026-10-31',after-before,l,d);continue;}
 push(unit,'2026-10-01','2026-10-31',cum(f,'2026-10-31')-opening,loc,dept);
}}
const checks=[],check=(name,ok)=>checks.push({name,passed:!!ok}),actual=ui.rows.map(c=>({unit:c[2],costCenter:c[3],allocation:c[4],from:c[5],to:c[6],charge:c[7]}));
check('Exact number of expense segments',actual.length===expected.length);check('No unexpected UI segments',actual.every(a=>expected.some(e=>e.unit===a.unit&&e.from===a.from&&e.to===a.to)));
for(const e of expected){const a=actual.filter(a=>a.unit===e.unit&&a.from===e.from&&a.to===e.to);check(`${e.unit} ${e.from}–${e.to} exact amount/allocation`,a.length===1&&a[0].charge===e.charge&&a[0].costCenter===e.costCenter&&a[0].allocation===e.allocation);}
const total=amount(expected.reduce((n,r)=>n+cents(r.charge),0n)),actualTotal=amount(actual.reduce((n,r)=>n+cents(r.charge),0n));check('Independent exact total',total===actualTotal&&ui.caption.includes(total));check('No readiness exceptions',ui.exceptions.length===0);
const failed=checks.filter(x=>!x.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',oracle:'Independent rational arithmetic against rendered UI; no production calculation imports',checked:checks.length,failed,expectedTotal:total,observedTotal:actualTotal,segments:expected.length,expected};writeFileSync(`${root}/october-preview-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,expected:undefined}));if(failed.length)process.exitCode=1;
