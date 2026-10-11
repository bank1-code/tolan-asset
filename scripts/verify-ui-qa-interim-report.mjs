// Independent roll-forward from reconciled September balances and explicit UI test movements.
import {readFileSync,writeFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
const root='qa-results/ui-full-cycle',read=f=>JSON.parse(readFileSync(`${root}/${f}`,'utf8'));
const prior=read('report-2026-09-restored-ui-observed.json'),actual=read('report-2026-10-interim-ui-observed.json');
const plan=read('planned-data.json'),cases=read('lifecycle-cases.json').cases;
const disposals=read('exclusions-financial-verification.json').observed,warranties=read('warranty-financial-verification.json').observed;
const cents=v=>{const s=String(v),negative=s.startsWith('-'),[a,b='']=s.replace(/^-/,'').split('.');return (BigInt(a)*100n+BigInt(b.padEnd(2,'0')))*(negative?-1n:1n);};
const checks=[],check=(key,pass)=>checks.push({key,pass}),expected=[];
for(const classification of plan.classifications){
 const p=prior.rows.find(r=>r[0]===classification.name);
 let additions=0n,removedCost=0n,carriedAccum=0n,removedAccum=0n,costDelta=0n,accumDelta=0n;
 for(const op of disposals){const c=cases.find(c=>c.case===op.case);if(c.fixture.classificationCode!==classification.code)continue;removedCost+=cents(c.fixture.unitCost)*BigInt(c.quantity);removedAccum+=cents(op.independentAccumulatedPerUnit)*BigInt(c.quantity);}
 for(const op of warranties){const c=cases.find(c=>c.case===op.case);if(c.fixture.classificationCode!==classification.code)continue;const cost=cents(c.fixture.unitCost)*BigInt(c.quantity),accum=cents(op.independentAccumulatedPerUnit)*BigInt(c.quantity);additions+=cost;removedCost+=cost;carriedAccum+=accum;removedAccum+=accum;}
 if(classification.code==='VEH'){
  const c=cases.find(c=>c.case==='CORRECTION');
  costDelta=(8200000n-cents(c.fixture.unitCost))*BigInt(c.fixture.quantity);
  // The independent baseline was reconciled per unit before the prospective correction.
  const baseline=read('baseline-expected.json').months.find(m=>m.month==='2026-09').rows.find(r=>r.key===c.fixture.key);
  accumDelta=320000n*BigInt(c.fixture.quantity)-cents(baseline.closingAccumulated);
 }
 const openingCost=cents(p[5]),openingAccum=cents(p[11]),closingCost=openingCost+additions+costDelta-removedCost,closingAccum=openingAccum+carriedAccum+accumDelta-removedAccum;
 const fields=[openingCost,additions,costDelta,removedCost,closingCost,openingAccum,carriedAccum,0n,accumDelta,removedAccum,closingAccum,0n,closingCost-closingAccum];
 expected.push({classification:classification.name,values:fields.map(String)});
 const row=actual.rows.find(r=>r[0]===classification.name);check(`${classification.code}: one classification`,!!row&&actual.rows.filter(r=>r[0]===classification.name).length===1);
 fields.forEach((v,i)=>check(`${classification.code}: ${actual.headers[i+1]}`,!!row&&cents(row[i+1])===v));
}
check('Report shows exact chosen period',actual.title.includes('01/10/2026')&&actual.title.includes('11/10/2026'));
check('Open October explicitly disclosed',actual.text.includes('فترات لم تعتمد بعد: 2026-10')&&actual.text.includes('الحركات المعتمدة فقط'));
check('No monthly depreciation journal invented',actual.rows.every(r=>r[8]==='0.00'));
const w=XLSX.read(readFileSync(`${root}/report-2026-10-interim-ui-export.xlsx`),{type:'buffer'}),sheet=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1});
check('Excel title reflects exact period',sheet[0][0]===actual.title);
actual.rows.forEach(r=>{const exported=sheet.slice(3).find(x=>x[0]===r[0]);check(`${r[0]}: Excel exact numerical values`,!!exported&&r.slice(1).every((v,i)=>typeof exported[i+1]==='number'&&cents(exported[i+1].toFixed(2))===cents(v)));});
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,source:'Rendered UI and downloaded workbook; independent roll-forward, no production calculation imports',passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,expected,checks};writeFileSync(`${root}/report-2026-10-interim-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass),expected:undefined}));if(result.failed)process.exitCode=1;
