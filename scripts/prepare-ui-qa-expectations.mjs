// Independent baseline oracle: no imports from production depreciation code.
// Local planning only; no database/API/browser operations.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const directory='qa-results/ui-full-cycle';
const data=JSON.parse(readFileSync(`${directory}/planned-data.json`,'utf8'));
const cents=value=>BigInt(value.replace('.',''));
const format=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
const gcd=(a,b)=>b===0n?a:gcd(b,a%b);
const sum=(a,b)=>{const n=a.n*b.d+b.n*a.d,d=a.d*b.d,g=gcd(n,d);return {n:n/g,d:d/g};};
const rounded=a=>(a.n+a.d/2n)/a.d;
const monthEnd=month=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);};
const nextMonth=month=>{const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);};
function elapsedMonths(from,to){
  if(from>to)return {n:0n,d:1n};
  let total={n:0n,d:1n};
  for(let month=from.slice(0,7);month<=to.slice(0,7);month=nextMonth(month)){
    const first=`${month}-01`,last=monthEnd(month);
    const start=from>first?from:first,end=to<last?to:last;
    const days=BigInt(Math.round((new Date(end+'T00:00:00Z')-new Date(start+'T00:00:00Z'))/86400000)+1);
    if(days>0n)total=sum(total,{n:days,d:BigInt(Number(last.slice(-2)))});
  }
  return total;
}
function cumulative(record,to){
  if(record.treatment==='NON_DEPRECIABLE'||record.treatment==='EXPENSE')return 0n;
  const base=cents(record.unitCost)-cents(record.unitResidual);
  const elapsed=elapsedMonths(record.availableForUseDate,to);
  const value=rounded({n:base*elapsed.n,d:BigInt(record.lifeMonths)*elapsed.d});
  return (value>base?base:value)*BigInt(record.quantity);
}
assert.equal(cumulative({unitCost:'6000.00',unitResidual:'0.00',quantity:1,lifeMonths:60,availableForUseDate:'2025-04-16'},'2025-04-30'),5000n);
assert.equal(cumulative({unitCost:'1000.00',unitResidual:'0.00',quantity:1,lifeMonths:12,availableForUseDate:'2025-01-01'},'2025-01-31'),8333n);
assert.equal(cumulative({unitCost:'1000.00',unitResidual:'0.00',quantity:1,lifeMonths:12,availableForUseDate:'2025-01-01'},'2025-12-31'),100000n);
const months=[];
for(let month='2025-01';month<='2026-09';month=nextMonth(month)){
  const to=monthEnd(month),prior=new Date(new Date(`${month}-01T00:00:00Z`).getTime()-86400000).toISOString().slice(0,10);
  const rows=data.records.map(r=>{
    const cost=r.recognitionDate<=to?cents(r.unitCost)*BigInt(r.quantity):0n;
    const accumulated=cumulative(r,to),opening=cumulative(r,prior),charge=accumulated-opening;
    return {key:r.key,classificationCode:r.classificationCode,entityType:r.entityType,cost:format(cost),openingAccumulated:format(opening),charge:format(charge),closingAccumulated:format(accumulated),net:format(cost-accumulated)};
  });
  const total=fields=>Object.fromEntries(fields.map(field=>[field,format(rows.reduce((n,r)=>n+cents(r[field]),0n))]));
  months.push({month,from:`${month}-01`,to,totals:total(['cost','openingAccumulated','charge','closingAccumulated','net']),rows});
}
writeFileSync(`${directory}/baseline-expected.json`,JSON.stringify({status:'REFERENCE_ONLY_NOT_OBSERVED',scope:'Straight line ACTUAL_DAYS baseline, no operational/financial movements, zero opening balances, per-unit cumulative rounding then quantity multiplication',source:'Independent rational arithmetic; no production calculation imports',months},null,2));
const cases=[
  ['AUTH','المحاسب ينشئ ولا يعتمد؛ المدير يعتمد مستند مستخدم آخر'],
  ['DRAFT','حفظ وتعديل المسودة أكثر من مرة ثم اعتمادها'],
  ['CLASS','مطابقة التصنيف في السجل والملف المالي'],
  ['HIERARCHY','اختيار موقع/فرع/قسم/موظف من هيكل واحد ورفض غير المتوافق'],
  ['IMPORT','القالب والاستيراد والتصدير من صفحات البرنامج'],
  ['DATES','تاريخ غير صحيح، نهاية شهر، تاريخ مستقبلي، جاهزية قبل الاعتراف، رصيد قبل بداية الوحدة'],
  ['COST','تكلفة سالبة/صفر/قيمة كبيرة/كسور ورفض المتبقي الأعلى من التكلفة'],
  ['UNIT','كمية ووحدات مكررة/ناقصة/زائدة، وتجزئة دفعات عند اختلاف تاريخ الجاهزية'],
  ['TRANSFER','نقل صحيح/متعارض، وبعد الاستبعاد، وصلاحيات النقل التاريخي'],
  ['INVENTORY','جرد جزئي ومسودة قابلة للتكرار وعدم إرسال الوحدات غير الممسوسة'],
  ['WARRANTY','استبدال وحدة/جزء/كل الكمية، تواريخ الضمان والوحدات البديلة واستمرار الأرصدة'],
  ['EXCLUSION','استبعاد جزء/كل المتبقي، تكرار الحركة وحدود المتبقي وتاريخ السريان'],
  ['DEPRECIATION','أجزاء الشهر وغياب الجاهزية والعمر المتبقي وقيمة متبقية وصافي ومجمع'],
  ['ESTIMATE','تغيير تقدير صحيح، والتكلفة الفعلية بعد تصحيح، ورفض حقول تصحيح داخل التقدير'],
  ['CORRECTION','تصحيح مستقل ومتوازن ورفض أثر سابق يفسد قيودًا لاحقة'],
  ['PERIOD','إرسال واعتماد وإغلاق وعكس حسب ترتيب الفترات وبنفس صلاحيات الفصل'],
  ['REPORT','تقرير تفصيلي وإجمالي حسب التصنيف والفترة والتخصيص ومطابقة الحساب المستقل'],
  ['EXCEL','تصدير قيود متوازنة بعد اعتماد الأشهر وعدم فقد دقة الأرقام'],
  ['HISTORY','تاريخ وتدقيق وأرشيف ومرفقات وطباعة بعد الاعتماد'],
  ['RETRY','تكرار حفظ/اعتماد ومنافسة مسودتين وعدم تكرار الكود أو الحركة'],
].map(([key,description])=>({key,description,status:'NOT_RUN',evidence:[],actual:null}));
writeFileSync(`${directory}/coverage.json`,JSON.stringify({status:'NOT_RUN',cases},null,2));
console.log(JSON.stringify({status:'EXPECTED_BASELINE_ONLY',months:months.length,referenceSelfChecks:3,coverageAreas:cases.length,lastMonth:months.at(-1).month,lastMonthExpected:months.at(-1).totals}));
