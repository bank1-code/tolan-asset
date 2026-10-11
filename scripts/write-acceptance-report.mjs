import {readFileSync,writeFileSync} from 'node:fs';
const suite=JSON.parse(readFileSync('qa-results/acceptance-final-suite.json','utf8'));
const database=JSON.parse(readFileSync('qa-results/repair-database-suite.json','utf8'));
const load=JSON.parse(readFileSync('qa-results/acceptance-load.json','utf8'));
const before=JSON.parse(readFileSync('qa-results/acceptance-load-before.json','utf8'));
const roles=JSON.parse(readFileSync('qa-results/acceptance-roles.json','utf8'));
const installation=JSON.parse(readFileSync('qa-results/acceptance-installation.json','utf8'));
const main=JSON.parse(readFileSync('qa-results/final-main-verification.json','utf8'));
const pack=JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
const summary={date:new Date().toISOString(),decision:'CONTROLLED_PILOT_ONLY',unit:{passed:suite.numPassedTests,failed:suite.numFailedTests,dbDeferred:suite.numPendingTests},database:{passed:database.numPassedTests,failed:database.numFailedTests},httpRoles:roles.checks.length,installation:installation.checks.length,load:load.loads.map(({concurrency,requests,successful,failed,p95,median,withinTwoSeconds})=>({concurrency,requests,successful,failed,p95,median,withinTwoSeconds})),originalRecordsUnchanged:main.originalRecordsUnchanged,package:pack.directory};
writeFileSync('qa-results/acceptance-summary.json',JSON.stringify(summary,null,2));
const report=`# محضر القبول الفني — 7 أكتوبر 2026

القرار: يصلح البرنامج لتجربة محدودة تحت الإشراف. لم يعتمد للتسليم التجاري العام أو للإعلان بأنه جاهز بالكامل. نجاح الحالات المنفذة لا يثبت اكتمال تغطية كل احتمالات الاستخدام أو الأمان.

## النتائج المثبتة

| الاختبار | النتيجة |
|---|---|
| مجموعة اختبارات البرنامج | ${suite.numPassedTests} ناجح، ${suite.numFailedTests} فاشل؛ ${suite.numPendingTests} اختبار قاعدة مؤجل في التشغيل العام |
| اختبارات القاعدة المؤجلة، شغلت منفصلة فعليًا | ${database.numPassedTests} ناجح، ${database.numFailedTests} فاشل |
| جلسات HTTP فعلية للأدوار الخمسة | ${roles.checks.length} حالة ناجحة |
| تهيئة الحزمة وإعادة تشغيلها وحماية حساب المدير | ${installation.checks.length} حالات ناجحة |
| حمل 25 مستخدمًا متزامنًا | ${load.loads[0].successful}/${load.loads[0].requests} طلب ناجح؛ P95=${load.loads[0].p95/1000} ثانية |
| حمل 50 مستخدمًا متزامنًا | ${load.loads[1].successful}/${load.loads[1].requests} طلب ناجح؛ P95=${load.loads[1].p95/1000} ثانية |
| حفظ السجلات الأصلية | تطابقت بصمات ${main.originalAssetCount} أصلًا و${main.originalCustodyCount} عهدة مع خط الأساس |

نسبة نجاح الاختبارات المنفذة في التشغيل العام والمنفصل للقاعدة: ${((suite.numPassedTests+database.numPassedTests)/(suite.numPassedTests+database.numPassedTests+suite.numFailedTests+database.numFailedTests)*100).toFixed(0)}%. هذه نسبة نجاح حالات اختبار محددة، وليست نسبة ضمان جودة البرنامج كله.

## ما تغير داخل مجلد المشروع

- حجب تنزيل نسخ القاعدة وبياناتها في سجل التدقيق عن غير المالك، مع التحقق من ترميز مسار الملف.
- حماية النصوص الديناميكية في سبعة مسارات طباعة مع الحفاظ على الصور والتنسيق والتوقيعات.
- احتساب كل محاولة دخول داخل الإجراء نفسه، بما يشمل الطلبات المجمعة؛ لا تعتمد الحماية على اسم مسار HTTP فقط.
- التحقق من صلاحية رافع الملف قبل معالجة محتواه، وتحديد عدد الملفات والحقول والحجم.
- عزل قراءة Excel في عامل محدود الذاكرة والوقت، والتحقق من الحجم بعد فك الضغط والترويسات المحلية والمركزية وأبعاد الورقة قبل تحويلها إلى صفوف. الحد 1000 صف بيانات و64 عمودًا و10MiB ملف، دون استيراد جزء مبتور بصمت. يسمح بعاملين للاستيراد في العملية؛ تعاد المحاولة إذا كانت مشغولة.
- منع برنامج تهيئة المدير من إعادة ضبط حساب قائم أو طباعة كلمة مروره.
- تحميل شاشتي الأصول والعهد في صفحات 50 سجلًا، مع بحث خادمي وعدد نتائج وصلاحيات الموظف نفسها. بقي عقد API القديم للقوائم الأخرى كما هو.
- فصل حد الطلبات للجلسات ذات التوقيع الصحيح بحسب الهوية، والإبقاء على حد IP للدخول والطلبات المجهولة. لم نثق في كوكيز غير موثقة أو عنوان يرسله العميل.
- تقليل تحديث تاريخ آخر نشاط إلى مرة في الدقيقة؛ تظل الصلاحيات والموظف المرتبط مقروءة من القاعدة في كل طلب.

## مقارنة الأداء

قبل الإصلاح كان P95 عند 25 مستخدمًا ${before.loads[0].p95/1000} ثانية وعند 50 مستخدمًا ${before.loads[1].p95/1000} ثانية. أصبح ${load.loads[0].p95/1000} و${load.loads[1].p95/1000} ثانية على التوالي. المقارنة تخص مسارات القوائم والبحث المحلية المذكورة في ملف الحمل، مع قاعدة بعيدة. خفض حجم البيانات هو جزء من الإصلاح، لذلك لا تعتبر النتائج اختبارًا لعرض 10000 سجل في استجابة واحدة.

هدف نحو ثانيتين للطلبات العادية غير متحقق بالكامل، خصوصًا عند الذروة. نجح كل الطلبات، لكن ذلك لا يلغي ملاحظة الأداء. لم يشمل قياس الحمل جلسات طويلة أو رفع ملفات متزامنًا أو إهلاكًا متعدد السنوات.

## حالة بنود الجاهزية التجارية الخمسة

| البند | المنجز | ما يمنع اعتباره مغلقًا بالكامل |
|---|---|---|
| دورة العمل والأدوار والملفات والطباعة | جلسات الأدوار الفعلية؛ اختبارات الجرد والاعتماد؛ اختبارات HTTP للرفع؛ مخرجات الطباعة السبعة | تغطية المتصفح محدودة؛ ربط التخزين الفعلي لجميع أنواع الملفات والطابعة الحقيقية غير معتمدين |
| الأمن والحمل | إصلاح المسارات المعروفة واختبار محفزاتها وحالاتها السليمة؛ حمل 25/50 مستخدمًا | المراجعة الأمنية الشاملة السابقة توقفت ولم تصدر تقريرًا نهائيًا؛ مراجعة الإصلاح المستقلة أعادت ملاحظتين عولجتا ثم تعذر إكمالها. حد الطلبات ومحاولات الدخول داخل عملية واحدة فقط. يلزم اختبار ممتد وبيئة مماثلة للعميل |
| التثبيت والتحديث والنسخ والاستعادة | تهيئة فارغة ورفض إعادة التهيئة وتشغيل حزمة الإنتاج وإعادة تشغيل نفس الإصدار؛ اختبار استعادة قاعدة فعلي | اعتمد التثبيت على node_modules في المجلد الأب. لم ينفذ تثبيت جهاز نظيف أو ترقية بين إصدارين أو استعادة تخزين المرفقات أو إثبات RPO24h/RTO4h |
| فصل الاختبارات والتعليمات والدعم | حزمة قائمة سماح بلا .env محلي أو بيانات أو كلمات مرور افتراضية؛ دليل تشغيل وتسليم | البيانات التجريبية لا تزال في قاعدة التطوير ولم تحذف. تتطلب نسخة العميل قاعدة جديدة وتهيئة تخص المؤسسة وخطة نسخ مجدولة |
| محضر قبول وقيود | هذا المحضر والنتائج الخام والأدلة | القبول النهائي مشروط بإغلاق القيود أعلاه وتوقيع مسؤول المؤسسة |

## البيئة وحماية البيانات

100 حساب، 10000 أصل، 5000 عهدة، 50 جلسة مستقلة في قواعد مؤقتة. استخدم الاختبار Loopback وعنوان IP واحدًا دون HTTPS. لم نقيد الحاسوب إلى 4 أنوية/8GB. حذفت قواعد الاختبار المنتهية؛ قاعدة اختبار المتصفح تحذف عند إنهاء الجلسة. لم نطبق ترحيل بنية أو حذف بيانات على قاعدة البرنامج في هذه الجولة.

آخر فحص لقاعدة التطوير: ${main.counts.assets} أصلًا، ${main.counts.custody_items} عهدة، ${main.counts.depreciation_batches} دفعة إهلاك مسودة، ${main.counts.depreciation_journals} قيدًا. لا تستخدم قاعدة التطوير هذه كتسليم نظيف.

## الأدلة وإعادة الفحص

- acceptance-final-suite.json وrepair-database-suite.json: نتائج الاختبارات الحالية.
- acceptance-roles.json: الأدوار وحجب تدقيق النسخ وترقيم الموظف.
- acceptance-load.json وacceptance-load-before.json: عينات الأداء الحالية وخط الأساس.
- acceptance-installation.json: حدود التثبيت وإعادة التشغيل صراحة.
- final-main-verification.json: بصمات السجلات الأصلية وأعداد القاعدة.
- pilot-package.json: مسار الحزمة وبصمات الملفات؛ الحالة PILOT_NOT_COMMERCIAL.
- OPERATIONS_GUIDE.md: قائمة تسليم وتشغيل ونسخ واستعادة ودعم.

الحزمة الحالية: ${pack.directory}
`;
writeFileSync('qa-results/ACCEPTANCE_REPORT.md',report+`

## فحص المتصفح والحزمة النهائية

نجح دخول المحاسب وعرض الأصل، والبحث الذي لا يجد سجلًا، والبحث باسم الموظف المرتبط. لم يثبت فحص نافذة الطباعة في المتصفح المدمج الطباعة الفعلية. يوجد الدليل في acceptance-browser.json والصورة التالية.

![دليل البحث في المتصفح](acceptance-browser-search.png)

حذفت قاعدة اختبار المتصفح بعد إيقاف الخادم الخاص بها. اختبرت تعريفات schema-empty.sql من الحزمة الأخيرة نفسها، مع 6 حالات تهيئة وتشغيل وحماية الحساب القائمة. تطابقت بصمات ملفات الحزمة ولم يحتو ملف البنية على INSERT أو الحزمة على .env محلي؛ راجع acceptance-package-verification.json.

سجل إصلاحات الأمن المحددة محفوظ منفصلًا عبر Codex Security؛ لا يمثل مراجعة شاملة مكتملة للمشروع.
`);console.log(JSON.stringify(summary));
