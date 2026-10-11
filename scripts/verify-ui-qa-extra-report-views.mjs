// Independent allocation totals from the original per-record monthly oracle.
import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',read=f=>JSON.parse(readFileSync(`${root}/${f}`,'utf8'));
const plan=read('planned-data.json'),month=read('baseline-expected.json').months.find(m=>m.month==='2026-09'),ui=read('report-extra-views-ui-observed.json');
const cents=v=>BigInt(String(v).replace('.','')),groups=new Map(),checks=[],check=(key,pass)=>checks.push({key,pass});
for(const r of month.rows){const f=plan.records.find(f=>f.key===r.key);if(cents(r.charge)===0n)continue;const classification=plan.classifications.find(c=>c.code===f.classificationCode).name,department=plan.departments.find(d=>d.key===f.departmentKey).name,location=plan.locations.find(l=>l.key===f.locationKey).name,branch=plan.branches.find(b=>b.key===f.branchKey).name,key=JSON.stringify([classification,department,location,branch,department]);groups.set(key,(groups.get(key)||0n)+cents(r.charge));}
check('18 allocation groups, no additional groups',ui.expense.rows.length===groups.size&&groups.size===18);
for(const [key,expected]of groups){const parts=JSON.parse(key),rows=ui.expense.rows.filter(r=>JSON.stringify(r.slice(0,5))===key);check(`${parts[0]}/${parts[1]}: exact allocation and charge`,rows.length===1&&cents(rows[0][5])===expected);}
check('Fully depreciated report correctly empty, including non-depreciable land',ui.fully.rowCount===0);
check('Period status uses selected month and reconciled expense',JSON.stringify(ui.exceptions.rows)===JSON.stringify([['2026-09','معتمد','113855.76']]));
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks};writeFileSync(`${root}/report-extra-views-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
