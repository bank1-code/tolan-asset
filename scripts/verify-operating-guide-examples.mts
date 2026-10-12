import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {calculateBatch, money, amount, type FinancialBatch} from '../shared/depreciation.ts';

// Exercise the actual calculation function using in-memory educational examples.
// No credentials, application endpoints or database are used.
const cases: any[]=[];
function verify(name:string, overrides:Partial<FinancialBatch['payload']>,expected:string,partialMonth:FinancialBatch['partialMonth']='ACTUAL_DAYS',from='2026-01-01',to='2026-01-31'){
 const batch:FinancialBatch={id:1,entityType:'asset',entityId:1,classificationId:1,policyId:1,
  payload:{label:'Guide example',quantity:1,unitCost:'6000.00',unitResidual:'0.00',openingAccumulated:'0.00',openingImpairment:'0.00',recognitionDate:'2026-01-01',availableForUseDate:'2026-01-01',balanceDate:'2026-01-01',lifeMonths:60,documentReference:'GUIDE-EXAMPLE',units:['GUIDE-001'],allocation:{costCenter:'GUIDE',location:'GUIDE',branch:'',department:''},notes:'',...overrides},
  rule:{classificationId:1,treatment:'DEPRECIABLE',lifeMonths:60,residualPercent:'0',expenseName:'مصروف إهلاك',accumulatedName:'مجمع إهلاك',costName:'تكلفة أصل'},partialMonth,identity:{code:'GUIDE',name:'Example',classification:'Guide',classificationCode:'GUIDE'}};
 const result=calculateBatch(batch,[],from,to);
 const actual=amount(result.lines.reduce((n,l)=>n+money(l.debit),0n));
 assert.equal(actual,expected,name);
 cases.push({name,expected,actual,passed:true,closing:result.units});
 return result;
}
verify('20 percent, complete month',{},'100.00');
verify('15 percent, complete month',{unitCost:'8000.00',lifeMonths:80},'100.00');
verify('10 percent, complete month',{unitCost:'12000.00',lifeMonths:120},'100.00');
verify('Residual 600',{unitResidual:'600.00'},'90.00');
const opening=verify('Old asset remaining life 48',{recognitionDate:'2025-01-01',availableForUseDate:'2025-01-01',openingAccumulated:'1200.00',lifeMonths:48},'100.00');
assert.equal(opening.units[0].accumulated,'1300.00');assert.equal(opening.units[0].net,'4700.00');
verify('Old asset incorrectly assigned full life 60',{recognitionDate:'2025-01-01',availableForUseDate:'2025-01-01',openingAccumulated:'1200.00',lifeMonths:60},'80.00');
verify('January 16, actual days',{availableForUseDate:'2026-01-16'},'51.61');
verify('January 16, next month',{availableForUseDate:'2026-01-16'},'0.00','NEXT_MONTH');
verify('January 1, next month policy',{},'100.00','NEXT_MONTH');
const office=verify('May complete month',{recognitionDate:'2026-05-01',availableForUseDate:'2026-05-01',balanceDate:'2026-05-01'},'100.00','ACTUAL_DAYS','2026-05-01','2026-05-31');
assert.equal(office.units[0].net,'5900.00');
assert.equal((360000n/24n).toString(),'15000');
assert.equal(600000n-200000n-350000n,50000n);
assert.equal(600000n-200000n-450000n,-50000n);
const output='tmp/pdfs/operating-guide/example-verification.json';
await fs.mkdir('tmp/pdfs/operating-guide',{recursive:true});
await fs.writeFile(output,JSON.stringify({status:'PASS',cases,arithmeticChecks:{estimateMonthly:'150.00',disposalLoss:'500.00',disposalProfit:'500.00'},databaseWrites:0},null,2));
console.log(JSON.stringify({status:'PASS',calculationCases:cases.length,arithmeticChecks:3,databaseWrites:0}));
