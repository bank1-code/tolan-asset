// Planning only. Business actions are performed through the browser UI.
import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle';
const plan=JSON.parse(readFileSync(`${root}/planned-data.json`,'utf8'));
const ops=JSON.parse(readFileSync(`${root}/operational-approval-verification.json`,'utf8')).observed;
const files=JSON.parse(readFileSync(`${root}/financial-input-verification.json`,'utf8')).observed;
const baseline=JSON.parse(readFileSync(`${root}/baseline-expected.json`,'utf8')).months.at(-1);
const spec=[
 {case:'WARRANTY_PARTIAL_ASSET',key:'QA-A-ITC-10',quantity:2,effectiveDate:'2026-10-05',incidentDate:'2026-10-03',policy:'continued',replacementName:'جهاز نسخ مكتبي — بديل ضمان تجريبي'},
 {case:'WARRANTY_FULL_CUSTODY',key:'QA-C-ITC-01',quantity:1,effectiveDate:'2026-10-06',incidentDate:'2026-10-04',policy:'renewed',replacementName:'حاسوب مكتبي — بديل ضمان تجريبي'},
 {case:'EXCLUSION_PARTIAL_ASSET',key:'QA-A-ELC-07',quantity:3,effectiveDate:'2026-10-07'},
 {case:'EXCLUSION_REMAINDER_ASSET',key:'QA-A-ELC-07',quantity:7,effectiveDate:'2026-10-09'},
 {case:'EXCLUSION_FULL_CUSTODY',key:'QA-C-TLS-03',quantity:2,effectiveDate:'2026-10-08'},
 {case:'TRANSFER_ASSET',key:'QA-A-FUR-06',quantity:5},
 {case:'TRANSFER_CUSTODY',key:'QA-C-COM-04',quantity:2},
 {case:'ESTIMATE',key:'QA-A-LAB-06',quantity:5,effectiveDate:'2026-10-01'},
 {case:'CORRECTION',key:'QA-A-VEH-07',quantity:10,effectiveDate:'2026-10-01'},
 {case:'INVENTORY_UNTOUCHED',key:'QA-A-KIT-05'},
 {case:'INVENTORY_EQUAL',key:'QA-A-KIT-06',actualQuantity:5},
 {case:'INVENTORY_SHORTAGE',key:'QA-C-KIT-07',actualQuantity:9},
 {case:'INVENTORY_SURPLUS',key:'QA-A-SEC-03',actualQuantity:3},
];
const cases=spec.map(s=>{
 const fixture=plan.records.find(r=>r.key===s.key),operational=ops.find(r=>r.key===s.key),financial=files.find(r=>r.key===s.key),closing=baseline.rows.find(r=>r.key===s.key);
 if(!fixture||!operational||!financial||!closing)throw Error(`Missing test fixture ${s.key}`);
 if(s.quantity&&s.quantity>fixture.quantity)throw Error(`Invalid case quantity ${s.key}`);
 return {...s,status:'NOT_RUN',fixture,operational,financial,closingSeptember:closing,originalUnits:s.quantity?fixture.units.slice(0,s.quantity):fixture.units,replacementUnits:s.case.startsWith('WARRANTY')?fixture.units.slice(0,s.quantity).map(u=>`${u}-W202610`):[]};
});
writeFileSync(`${root}/lifecycle-cases.json`,JSON.stringify({createdAt:new Date().toISOString(),sourceDatabaseModified:false,baselineApprovedRequired:true,cases},null,2));
console.log(JSON.stringify({planned:cases.length,businessDataInserted:false}));
