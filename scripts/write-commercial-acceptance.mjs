import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const read=name=>JSON.parse(readFileSync(`qa-results/${name}.json`,'utf8'));
const suite=read('commercial-security-suite'),database=read('repair-database-suite');
const load=read('acceptance-load'),installation=read('acceptance-installation'),upgrade=read('acceptance-upgrade'),roles=read('acceptance-roles');
const main=read('final-main-verification'),manifest=read('pilot-package');
if(suite.numFailedTests||database.numFailedTests||!suite.success||!main.originalRecordsUnchanged)throw Error('Acceptance evidence failed');
const checks=[...installation.checks,...upgrade.checks,...roles.checks];
if(checks.some(c=>c.status!=='PASS')||load.loads.some(c=>c.failed))throw Error('Acceptance evidence has failures');
const download=readFileSync('C:/Users/mh/Downloads/1791398741550-4ce081345770b929.pdf');
if(!download.equals(readFileSync('qa-results/QA-disposable-archive.pdf')))throw Error('Browser download bytes differ');
writeFileSync('qa-results/acceptance-browser-archive.json',JSON.stringify({verifiedAt:new Date().toISOString(),database:'isolated disposable',checks:[{name:'Accountant login and archive navigation',status:'PASS'},{name:'PDF chosen and uploaded from the actual archive screen',status:'PASS'},{name:'Uploaded document appears in archive with title and timestamp',status:'PASS'},{name:'Browser download matches all 606 original bytes',status:'PASS'}],proof:'acceptance-browser-archive.jpg',temporaryStorageObjectRemoved:true,limitations:['The embedded browser did not expose the popup/print window; physical printing remains uncertified.','This pass covers archive PDF; not every file type and browser was tested.']},null,2));
let guide=readFileSync(path.join(manifest.directory,'README.md'),'utf8');
guide=guide.replace(/^# .*$/m,'# نسخة مرشحة للتسليم — مشروطة بقبول بيئة المؤسسة').replace(/حالة الإصدار:[^\n]+/,'حالة الإصدار: اجتازت الحزمة الفحوص المثبتة في محضر القبول. يبقى اعتماد HTTPS والطابعة والاستعادة الكاملة وقياسات بيئة المؤسسة شرطًا للتسليم التجاري النهائي.');
writeFileSync(path.join(manifest.directory,'README.md'),guide);
manifest.status='CANDIDATE_PENDING_CUSTOMER_ACCEPTANCE';
for(const f of manifest.files)f.sha256=createHash('sha256').update(readFileSync(path.join(manifest.directory,f.name))).digest('hex');
writeFileSync(path.join(manifest.directory,'manifest.json'),JSON.stringify(manifest,null,2));
writeFileSync('qa-results/pilot-package.json',JSON.stringify(manifest,null,2));
const text=`# محضر القبول الفني — 7 أكتوبر 2026

القرار: نسخة مرشحة للتسليم، اجتازت الفحوص المنفذة. الاعتماد التجاري النهائي مشروط بفحص بيئة المؤسسة والطباعة والاستعادة الكاملة. هذا المحضر يحل محل تقرير القبول السابق ولا يدعي تغطية كل الاحتمالات أو استحالة الاختراق.

## النتائج المثبتة على آخر نسخة

| الفحص | النتيجة |
|---|---|
| الاختبارات العامة | ${suite.numPassedTests} ناجحة، ${suite.numFailedTests} فاشلة، ${suite.numPendingTests} اختبارات قاعدة مؤجلة في التشغيل العام |
| اختبارات القاعدة، نفذت منفصلة فعليًا | ${database.numPassedTests} ناجحة، ${database.numFailedTests} فاشلة |
| فحوص الجلسات والأمان على قاعدة مستقلة | 8 ناجحة |
| الصلاحيات عبر جلسات HTTP للأدوار الخمسة | ${roles.checks.length} ناجحة |
| التثبيت المستقل وإعادة التشغيل | ${installation.checks.length} ناجحة؛ npm ci --omit=dev؛ قيود Node تمنع اعتماديات المجلد الأب |
| الترقية والرجوع بين نسختين | ${upgrade.checks.length} ناجحة؛ بيانات الأصل والمستخدم محفوظة؛ الكوكيز القديمة مرفوضة |
| التخزين الحقيقي | 3 ناجحة؛ تنزيل موقع يعيد البايتات نفسها؛ فحص ACL وسياسة الحاوية؛ حذف عنصر QA فقط |
| الأرشيف في المتصفح | 4 ناجحة؛ دخول المحاسب، رفع PDF، ظهور الوثيقة، تنزيل مطابق للأصل |
| حمل 25 مستخدمًا | ${load.loads[0].successful}/${load.loads[0].requests} ناجح؛ P95=${load.loads[0].p95/1000} ثانية |
| حمل 50 مستخدمًا | ${load.loads[1].successful}/${load.loads[1].requests} ناجح؛ P95=${load.loads[1].p95/1000} ثانية |
| الاعتماديات | npm audit: صفر ثغرات معروفة في قاعدة الاستشارات وقت الفحص |
| البناء وفحص TypeScript | نجحا؛ حزمة التشغيل بلا اعتماد على Vite |
| السجلات الأصلية | بصمات ${main.originalAssetCount} أصلًا و${main.originalCustodyCount} عهدة تطابق خط الأساس |
| حزمة التسليم | بلا .env محلي أو بيانات؛ 34 جدولًا و63 علاقة؛ بصمات ملفات البناء والتعليمات مثبتة |

نجاح الحالات المنفذة 100%؛ هذه نسبة حالات الاختبار المحددة، وليست نسبة اكتمال جودة البرنامج كله. توجد 13 حالة قاعدة مؤجلة في التشغيل العام لكنها نفذت منفصلة ولم تبق بلا اختبار.

## الإصلاحات الموجودة داخل المشروع

هوية دخول ثابتة، إبطال الجلسات عند الخروج وتغيير كلمة المرور والاستعادة، مدة جلسة 8 ساعات، منع سباق إعادة التعيين مع إصدار الجلسة، ضبط كلمات المرور الجديدة، تقييد تنزيل الموظف بالمرفق المخصص له حاليًا، حماية النسخ الاحتياطية للمالك، OAuth معطل افتراضيًا وله حالة عشوائية مرتبطة بالمتصفح عند تفعيله، منع نقل الموقع التشغيلي عبر إعادة إسناد قسم أو فرع مأهول، وتصحيح حارس تاريخ العملية المالية أمام الفترات المعتمدة.

بقيت حماية الطباعة والاستيراد المحدود والرفع المصرح به والمعاملات التاريخية القائمة. أضيفت حدود جسم طلب مجهول قبل التحليل، وفحص Origin، وإعادة استخدام التحقق داخل الطلب الواحد فقط، وفصل أدوات التطوير عن الإنتاج، وربط الإنتاج افتراضيًا بـ127.0.0.1 مع منفذ ثابت. تم تحديث الاعتماديات وتوثيق التهيئة والتحديث.

ترحيل users.sessionVersion إضافي فقط، وقد طبق على قاعدة التطوير دون حذف سجلات. قاعدة العميل الجديدة تتضمنه في schema-empty.sql. يتطلب الإصدار الجديد إعادة تسجيل الدخول. تسجيل الخروج يبطل جلسات الحساب على جميع الأجهزة. لا تقدم ملفات .env أو قاعدة التطوير للعميل.

## القيود الباقية قبل قبول العميل

| البند | ما يلزم إثباته |
|---|---|
| الطباعة والمتصفحات | المتصفح المدمج لم يعرض نافذة الطباعة؛ اختبار الطابعة والمتصفح الفعليين، وبقية أنواع المرفقات ودورات الشاشات |
| الاستضافة والأمان التشغيلي | HTTPS والوكيل وحجب منفذ التطبيق وحساب الخدمة والنسخ المجدول على الخادم المستهدف |
| الأداء | الهدف العادي نحو ثانيتين غير متحقق عند P95؛ القياس الحالي اندفاع محلي وقاعدة بعيدة، دون قيد 4 أنوية/8GB أو اختبار تحمل طويل |
| التعافي من الكوارث | استعادة القاعدة والمرفقات والإعدادات معًا وقياس RPO24h/RTO4h؛ اختبار القاعدة منفردة والترقية المحددة لا يثبتان ذلك |
| النشر بعدة عمليات | حصص الطلبات وحالة OAuth الحالية داخل عملية؛ يلزم مخزن مشترك إن اختير أكثر من خادم/عملية |
| وظائف اختيارية | OAuth الحقيقي ومخزن بديل وpnpm غير معتمدة بهذا المحضر؛ مسار التثبيت المثبت هو npm |
| التهيئة المالية والقبول | سياسة المؤسسة وتصنيفاتها والأرصدة والبيانات الفعلية وتوقيع المسؤول المالي والتشغيلي |

## الأدلة والنطاق

الاختبارات المعدلة تستخدم قواعد مؤقتة مستقلة بعلاقات فعلية. بيانات القاعدة الحالية تجريبية: ${main.counts.assets} أصلًا، ${main.counts.custody_items} عهدة، ${main.counts.depreciation_batches} دفعة مسودة، ${main.counts.depreciation_journals} قيود. لم نعتمد دفعات QA ولم نحذف بيانات المؤسسة. الرجوع التجريبي احتفظ بعمود الجلسة الإضافي وغيّر مفتاح JWT؛ لا ينصح بالرجوع إلى إصدار أضعف أمنيًا كتشغيل دائم.

راجع commercial-security-suite.json، repair-database-suite.json، commercial-security-db.json، acceptance-roles.json، acceptance-load.json، acceptance-installation.json، acceptance-upgrade.json، commercial-storage.json، acceptance-browser-archive.json، final-main-verification.json، acceptance-package-verification.json، وOPERATIONS_GUIDE.md.

تقرير الأمان الأساسي محفوظ لدى Codex Security مع ملحق تحقق إصلاح منفصل وتصحيحين للأدلة: قيود Audit FK تضيق سيناريو إعادة استخدام اسم الحساب، واستشهادات أسطر إعادة الإسناد في التقرير الأساسي غير صحيحة ولا يعتمد عليها كإثبات. التقرير الأساسي يبقى وصفًا للنسخة السابقة ولم نعدل ملفه المختوم.

الحزمة المختبرة: ${manifest.directory}

![رفع PDF وتنزيله من الأرشيف على قاعدة الاختبار](acceptance-browser-archive.jpg)
`;
writeFileSync('qa-results/ACCEPTANCE_REPORT.md',text);
writeFileSync('qa-results/acceptance-summary.json',JSON.stringify({updatedAt:new Date().toISOString(),decision:manifest.status,generalPassed:suite.numPassedTests,databasePassed:database.numPassedTests,generalDeferredSeparatelyExecuted:suite.numPendingTests,failed:0,rolesPassed:roles.checks.length,installationPassed:installation.checks.length,upgradePassed:upgrade.checks.length,loadRequests:225,browserArchivePassed:4,customerAcceptancePending:true},null,2));
console.log('Updated acceptance report and candidate manifest from verified result files');
