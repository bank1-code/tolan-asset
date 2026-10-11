// Generates local planning data only. No database, API or browser calls.
import { mkdirSync, writeFileSync } from 'node:fs';

const specifications = [
  ['FUR','الأثاث والتجهيزات المكتبية',60,5,120000,
    ['مكتب تنفيذي','مكتب موظف','طاولة اجتماعات','خزانة ملفات','وحدة أدراج','مكتبة مكتبية','كنبة استقبال','طاولة استقبال','كرسي اجتماعات','فاصل مكتبي'],
    ['كرسي موظف','مكتب محمول','حامل ملفات','خزانة شخصية','طاولة تدريب','كرسي زائر','رف مكتبي','وحدة تخزين','كرسي مشرف','طاولة جانبية']],
  ['ITC','الحواسيب وملحقاتها',36,0,450000,
    ['خادم ملفات','حاسب مكتبي محاسبي','حاسب تصميم','حاسب استقبال','وحدة تخزين شبكية','محطة عمل هندسية','ماسح مستندات','طابعة ليزر','شاشة اجتماعات','جهاز نسخ مكتبي'],
    ['حاسب محمول محاسب','حاسب محمول مدير','جهاز لوحي ميداني','شاشة موظف','طابعة متنقلة','قارئ مستندات','جهاز حاسوب مصغر','محطة إرساء','ماسح محمول','شاشة مصمم']],
  ['VEH','المركبات ووسائل النقل',60,10,8000000,
    ['سيارة خدمة إدارية','مركبة توصيل','حافلة موظفين','مركبة صيانة','سيارة تشغيل ميداني','مركبة بضائع','مركبة زيارات','شاحنة خفيفة','سيارة إشراف','مركبة نقل معدات'],
    ['سيارة مسؤول الفرع','مركبة مندوب','سيارة مدير موقع','مركبة فني صيانة','سيارة مراقب','مركبة مهندس','سيارة خدمة عملاء','مركبة مشرف نقل','سيارة مسؤول مشتريات','مركبة فريق الدعم']],
  ['ELC','الأجهزة والمعدات الكهربائية',60,5,250000,
    ['مكيف مركزي','مولد كهربائي','وحدة طاقة احتياطية','جهاز تنقية هواء','لوحة توزيع كهربائية','مكيف مستودع','مضخة كهربائية','وحدة تهوية','جهاز تجفيف','منظم جهد'],
    ['مكيف متنقل','مروحة صناعية','وحدة طاقة مكتبية','جهاز تنظيف كهربائي','منفاخ كهربائي','مكنسة ميدانية','جهاز فحص كهرباء','كشاف عمل','منظم طاقة محمول','جهاز تعقيم كهربائي']],
  ['COM','أجهزة الاتصالات والشبكات',48,0,180000,
    ['مبدل شبكة','موجه رئيسي','نقطة وصول لاسلكية','بوابة اتصالات','سنترال مكتبي','وحدة مؤتمرات مرئية','جهاز تقوية إشارة','خادم اتصالات','وحدة اتصال احتياطية','هاتف مؤتمرات'],
    ['هاتف موظف','هاتف مشرف','جهاز اتصال لاسلكي','موجه ميداني','هاتف خدمة عملاء','هاتف مدير فرع','جهاز تتبع اتصالات','مودم محمول','وحدة اتصال فني','هاتف استقبال']],
  ['KIT','معدات الضيافة والمطابخ',60,5,160000,
    ['ثلاجة ضيافة','فرن كهربائي','غسالة أطباق','ماكينة قهوة رئيسية','مبرد مياه','فريزر تخزين','عجانة مطبخ','شفاط مطبخ','موقد تجهيز','خزانة تسخين'],
    ['ماكينة قهوة مكتبية','غلاية ضيافة','ميكروويف فرع','خلاط ضيافة','مبرد موظفين','جهاز تقديم ساخن','صانعة ثلج صغيرة','ميزان مطبخ','جهاز تجهيز مشروبات','فرن ضيافة صغير']],
  ['SEC','معدات السلامة والأمن',60,0,210000,
    ['لوحة إنذار حريق','كاميرا مراقبة رئيسية','مسجل كاميرات','بوابة أمنية','نظام تحكم دخول','جهاز كشف دخان','وحدة إنذار مستودع','حاجز دخول','كاميرا مراقبة خارجية','شاشة غرفة الأمن'],
    ['جهاز فحص سلامة','كاميرا أمن محمولة','جهاز اتصال حارس','كشاف سلامة','جهاز كشف غازات','وحدة إنذار متنقلة','قارئ دخول محمول','جهاز مراقبة ميداني','جهاز اختبار إنذار','كاميرا مشرف أمن']],
  ['TLS','الأدوات والمعدات الفنية',48,0,130000,
    ['منضدة صيانة','مثقاب ثابت','ضاغط هواء','ماكينة قطع','جهاز لحام','معدات رفع ورشة','جهاز قياس ثابت','وحدة تنظيف معدات','آلة صنفرة','مضخة اختبار'],
    ['مثقاب فني','مفتاح عزم','جهاز قياس رقمي','عدة صيانة كهربائية','منشار محمول','جهاز لحام محمول','عدة فحص ميكانيكي','صاروخ قطع','جهاز معايرة','مضخة فحص محمولة']],
  ['LAND','الأراضي والمواقع المملوكة',60,0,35000000,
    ['أرض المقر الرئيسي','أرض المستودع المركزي','أرض مركز الصيانة','أرض مركز التدريب','أرض منطقة الخدمات','أرض مستودع الفرع','أرض ساحة التخزين','أرض موقف التشغيل','أرض مركز التوزيع','أرض موقع التوسع'],
    ['أرض تحت إشراف مدير الفرع','أرض تحت إشراف مسؤول الموقع','أرض تحت إشراف مسؤول المخازن','أرض تحت إشراف مشرف الصيانة','أرض تحت إشراف مسؤول الخدمات','أرض تحت إشراف مشرف التشغيل','أرض تحت إشراف مسؤول الأمن','أرض تحت إشراف مشرف النقل','أرض تحت إشراف مسؤول التجهيز','أرض تحت إشراف مسؤول الممتلكات']],
  ['LAB','أجهزة القياس والمختبرات',60,0,320000,
    ['جهاز تحليل عينات','مجهر مختبر','حاضنة مخبرية','ميزان تحليلي','جهاز اختبار جودة','فرن مختبر','جهاز قياس رطوبة','وحدة اختبار مواد','جهاز قياس حرارة ثابت','جهاز معايرة مختبر'],
    ['جهاز قياس ميداني','مجهر محمول','ميزان فحص محمول','جهاز تحليل متنقل','جهاز فحص جودة ميداني','مقياس رطوبة محمول','جهاز اختبار ماء','جهاز قياس حرارة محمول','جهاز معايرة فني','جهاز قياس سماكة']],
];
const locations = ['الرياض','جدة','الدمام','المدينة المنورة','مكة المكرمة','تبوك','أبها']
  .map((name,i)=>({key:`L${i+1}`,name:`موقع ${name}`,assetPrefix:`AST-${['RYD','JED','DMM','MED','MKK','TBK','ABH'][i]}`,custodyPrefix:`CST-${['RYD','JED','DMM','MED','MKK','TBK','ABH'][i]}`}));
const branchSpec = [[0,'الإدارة الرئيسية'],[0,'الخدمات المشتركة'],[0,'المستودعات'],[1,'التشغيل الغربي'],[1,'الدعم الغربي'],[2,'التشغيل الشرقي'],[2,'الخدمات الشرقية'],[3,'التشغيل بالمدينة'],[3,'الدعم بالمدينة'],[4,'التشغيل بمكة'],[5,'التشغيل بتبوك'],[6,'التشغيل بأبها']];
const branches=branchSpec.map(([index,name],i)=>({key:`B${i+1}`,name:`فرع ${name}`,locationKey:locations[index].key}));
const departmentSpec = [[0,'المالية والحسابات'],[3,'تقنية المعلومات'],[5,'التشغيل والصيانة'],[7,'الخدمات الإدارية'],[9,'المشتريات والمخازن'],[10,'الجودة والسلامة']];
const departments=departmentSpec.map(([index,name],i)=>({key:`D${i+1}`,name:`قسم ${name}`,branchKey:branches[index].key,locationKey:branches[index].locationKey}));
const given=['أحمد','محمد','خالد','عبدالله','إبراهيم','يوسف','عمر','حسن','فهد','سعود'];
const families=['القحطاني','العمري','السلمي','الحربي','الزهراني','الدوسري'];
const employees=departments.flatMap((d,di)=>given.map((name,i)=>({key:`EMP-${String(di*10+i+1).padStart(3,'0')}`,name:`${name} ${families[di]} — تجريبي`,departmentKey:d.key,branchKey:d.branchKey,locationKey:d.locationKey,fingerprintId:`QA${String(di*10+i+1).padStart(3,'0')}`,nationalId:'',phone:''})));
const dates=['2025-01-01','2025-02-28','2025-04-15','2025-07-31','2025-12-31','2026-01-01','2026-02-28','2026-04-16','2026-06-30','2026-09-15'];
const quantities=[1,1,2,2,3,5,10,1,4,6];
const asAmount=n=>`${n/100n}.${String(n%100n).padStart(2,'0')}`;
const classifications=specifications.map(([code,name,lifeMonths,residualPercent])=>({code,name,lifeMonths,residualPercent,treatment:code==='LAND'?'NON_DEPRECIABLE':'DEPRECIABLE',expenseName:`مصروف إهلاك ${name}`,accumulatedName:`مجمع إهلاك ${name}`,costName:name}));
const records=specifications.flatMap(([code,,lifeMonths,residualPercent,base,assetNames,custodyNames],ci)=>['asset','custody'].flatMap((type,ti)=>(ti?custodyNames:assetNames).map((name,j)=>{
  const index=ci*20+ti*10+j,employee=employees[index%employees.length];
  const cost=BigInt(base+j*12345+ti*1725+(j%2?25:0)),residual=(cost*BigInt(residualPercent)+50n)/100n;
  const purchaseDate=dates[(j+ci)%dates.length];
  const availableForUseDate=(j%3===0)?new Date(new Date(purchaseDate+'T00:00:00Z').getTime()+15*86400000).toISOString().slice(0,10):purchaseDate;
  return {key:`QA-${type==='asset'?'A':'C'}-${code}-${String(j+1).padStart(2,'0')}`,entityType:type,name,classificationCode:code,treatment:code==='LAND'?'NON_DEPRECIABLE':'DEPRECIABLE',
    quantity:quantities[j],unitCost:asAmount(cost),unitResidual:asAmount(residual),lifeMonths,
    purchaseDate,recognitionDate:purchaseDate,availableForUseDate,balanceDate:purchaseDate,
    openingAccumulated:'0.00',openingImpairment:'0.00',locationKey:employee.locationKey,branchKey:employee.branchKey,departmentKey:employee.departmentKey,employeeKey:employee.key,
    units:Array.from({length:quantities[j]},(_,u)=>`${type==='asset'?'A':'C'}-${code}-${j+1}-U${u+1}`),
    documentReference:`QA-INV-${code}-${type==='asset'?'A':'C'}-${j+1}`,notes:`تجربة واجهة ${code} / ${j+1}. تاريخ الشراء المرجعي ${purchaseDate}.`};
})));
const rawCost=records.reduce((sum,r)=>sum+BigInt(r.unitCost.replace('.',''))*BigInt(r.quantity),0n);
const output={createdAt:new Date().toISOString(),purpose:'Local planning only; all future records must be entered through application pages.',
  technicalResetRequirements:['Preserve migration history','Preserve depreciation_control singleton id=1 with revision reset to zero','Preserve user identities, passwords and roles; detach deleted employee links'],
  policy:{organizationName:'مؤسسة التجربة الشاملة',currency:'SAR',fiscalStartMonth:1,openingDate:'2025-01-01',effectiveDate:'2025-01-01',capitalizationThreshold:'0.00',partialMonth:'ACTUAL_DAYS'},
  classifications,locations,branches,departments,employees,records,
  baseline:{assets:100,custody:100,classes:10,locations:7,branches:12,departments:6,employees:60,units:records.reduce((n,r)=>n+r.quantity,0),grossCost:asAmount(rawCost)},
  notes:['7th location and branches without departments intentionally exercise incomplete hierarchy rejection.','LAND is non-depreciable; its required schema lifeMonths placeholder is not used to charge depreciation. An EXPENSE classification rule and capitalization threshold are planned as subsequent controlled policy-version scenarios rather than silently misclassifying capital tools.','Dates are financial recognition dates in the existing financial page; the operational record form currently has no separate purchase-date input. This limitation must be disclosed or repaired before claiming separate purchase-date coverage.','No independent expected depreciation totals have yet been computed by this generator. Gross-cost planning total only.']};
mkdirSync('qa-results/ui-full-cycle',{recursive:true});
writeFileSync('qa-results/ui-full-cycle/planned-data.json',JSON.stringify(output,null,2));
console.log(JSON.stringify({status:'PLANNING_DATA_ONLY',...output.baseline}));
