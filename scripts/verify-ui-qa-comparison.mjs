import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',actual=JSON.parse(readFileSync(`${root}/report-comparison-ui-observed.json`,'utf8'));
const plan=JSON.parse(readFileSync(`${root}/planned-data.json`,'utf8')),baseline=JSON.parse(readFileSync(`${root}/baseline-expected.json`,'utf8'));
const table=actual.tables.find(t=>t.headers.length===7),checks=[];
const cents=v=>{const raw=String(v),sign=raw.startsWith('-')?-1n:1n,[a,b='']=raw.replace(/^-/,'').split('.');return sign*(BigInt(a)*100n+BigInt(b.padEnd(2,'0')));};
const check=(name,ok)=>checks.push({name,passed:Boolean(ok)});
check('Both explicit comparison ranges shown',actual.headings.some(h=>h.includes('01/01/2026')&&h.includes('31/05/2026')&&h.includes('01/01/2025')&&h.includes('31/05/2025')));
check('All ten classifications',table?.rows.length===10);
const sum=(code,year,field)=>baseline.months.filter(m=>m.month>=`${year}-01`&&m.month<=`${year}-05`).reduce((n,m)=>n+m.rows.filter(r=>r.classificationCode===code).reduce((a,r)=>a+cents(r[field]),0n),0n);
const net=(code,year)=>baseline.months.find(m=>m.month===`${year}-05`).rows.filter(r=>r.classificationCode===code).reduce((n,r)=>n+cents(r.net),0n);
for(const c of plan.classifications){const row=table?.rows.find(r=>r[0]===c.name);check(`${c.code}: exactly one row`,row&&table.rows.filter(r=>r[0]===c.name).length===1);if(!row)continue;
 const previous=sum(c.code,2025,'charge'),current=sum(c.code,2026,'charge'),priorNet=net(c.code,2025),currentNet=net(c.code,2026);
 for(const [index,value] of [previous,current,current-previous,priorNet,currentNet,currentNet-priorNet].entries())check(`${c.code}: comparison value ${index+1}`,cents(row[index+1])===value);
}
const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),source:'Rendered application comparison table',status:failed.length?'FAIL':'PASS',checked:checks.length,failed};
writeFileSync(`${root}/report-comparison-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
