import 'dotenv/config';
import mysql from 'mysql2/promise';
import {mkdirSync,readFileSync,writeFileSync,cpSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

// An allowlist prevents local credentials, QA records and seed scripts from shipping.
const destination=path.resolve('release/pilot-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(destination,{recursive:true});
cpSync('dist',path.join(destination,'dist'),{recursive:true});
const pkg=JSON.parse(readFileSync('package.json','utf8'));
pkg.scripts={start:'node start.mjs'};
writeFileSync(path.join(destination,'package.json'),JSON.stringify(pkg,null,2));
cpSync('package-lock.json',path.join(destination,'package-lock.json'));
cpSync('.npmrc',path.join(destination,'.npmrc'));
cpSync('scripts/initialize-empty.mjs',path.join(destination,'initialize-empty.mjs'));
writeFileSync(path.join(destination,'start.mjs'),"import 'dotenv/config';\nprocess.env.NODE_ENV='production';\nif(!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length<32) throw new Error('Configure DATABASE_URL and a random JWT_SECRET of at least 32 characters');\nawait import('./dist/index.js');\n");
writeFileSync(path.join(destination,'.env.example'),'DATABASE_URL=\nJWT_SECRET=\nPORT=3000\nAPP_HOST=127.0.0.1\nPUBLIC_APP_URL=https://your-company.example\nOAUTH_ENABLED=false\nIDRIVE_E2_ENDPOINT=\nIDRIVE_E2_BUCKET=\nIDRIVE_E2_REGION=us-east-1\nIDRIVE_E2_ACCESS_KEY_ID=\nIDRIVE_E2_SECRET_ACCESS_KEY=\nVITE_APP_ID=\n');
const db=await mysql.createConnection({uri:process.env.DATABASE_URL!,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
const definitions:string[]=[],relations:string[]=[];
try{
 const[tables]:any=await db.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
 for(const row of tables){const name=String(Object.values(row)[0]);if(!/^[a-zA-Z0-9_]+$/.test(name))throw new Error('Unsafe table');
  const[ddl]:any=await db.query(`SHOW CREATE TABLE \`${name}\``);const definition=String(ddl[0]['Create Table']);
  for(const match of definition.matchAll(/^\s*(CONSTRAINT[^\n]+FOREIGN KEY[^\n]*)/gm))relations.push(`ALTER TABLE \`${name}\` ADD ${match[1].replace(/,$/,'')};`);
  definitions.push(definition.replace(/^\s*CONSTRAINT[^\n]+FOREIGN KEY[^\n]*\n?/gm,'').replace(/,\s*\)/g,'\n)').replace(/AUTO_INCREMENT=\d+/g,'AUTO_INCREMENT=1').replace(/\/\*T!\[[^\]]+\][\s\S]*?\*\//g,'')+';');
 }
}finally{await db.end();}
writeFileSync(path.join(destination,'schema-empty.sql'),[...definitions,...relations].join('\n\n'));
writeFileSync(path.join(destination,'README.md'),`# نسخة تجريبية فقط — غير معتمدة للتسليم التجاري\n\nلا تحتوي هذه الحزمة على بيانات العملاء أو بيانات QA أو ملف .env.\n\n1. ثبت Node.js متوافقًا مع المشروع وMySQL متوافقًا مع البنية.\n2. أنشئ قاعدة جديدة فارغة واستورد schema-empty.sql بحساب تهيئة مخول. لا تستورده على قاعدة قائمة.\n3. نفذ npm ci --omit=dev من مجلد النسخة.\n4. انسخ .env.example إلى .env وأدخل بيانات القاعدة ومفتاح JWT عشوائيًا وإعدادات التخزين الخاصة بالمؤسسة.\n5. أنشئ حساب المالك عبر إجراء تهيئة معتمد؛ إجراء التهيئة الأولية ما زال قيد القبول، ولا توجد كلمة مرور افتراضية في الحزمة.\n6. شغل npm start خلف وكيل HTTPS، واحجب منفذ التطبيق عن الإنترنت المباشر. لا تستخدم وضع التطوير لدى العميل.\n\nقبل التحديث: انسخ قاعدة البيانات والملفات احتياطيًا، وجرب التحديث واستعادته على نسخة منفصلة، ثم طبق نافذة صيانة وخطة رجوع. لا يكفي حفظ القاعدة إن لم تحفظ المرفقات وإعدادات التشغيل أيضًا.\n\nالدعم: يسجل البلاغ بالدور، والشاشة، وخطوات التكرار والنتيجة المتوقعة والفعلية، دون إرفاق كلمات مرور أو نسخ قاعدة كاملة. رقم البلاغ وتاريخ الاستلام ومسؤول المعالجة وإثبات إعادة الاختبار مطلوبة.\n\nحالة الإصدار: تعيق ملاحظات الأمان والقبول المفتوحة اعتماده التجاري. استضافة 4 أنوية و8GB وHTTPS ليست مثبتة بقياسات هذه الحزمة.\n`);
const guidePath=path.join(destination,'README.md');
writeFileSync(guidePath,readFileSync(guidePath,'utf8').replace(/^# .*$/m,'# نسخة مرشحة للتسليم — مشروطة بقبول بيئة المؤسسة').replace(/حالة الإصدار:[^\n]+/,'حالة الإصدار: الاعتماد التجاري النهائي مشروط بمحضر القبول وفحص HTTPS والطباعة والاستعادة الكاملة وقياسات بيئة المؤسسة.').replace(/5\. أنشئ حساب المالك[^\n]+/,'5. حدد INIT_OWNER_USERNAME وINIT_OWNER_PASSWORD في جلسة تهيئة مؤقتة، ثم نفذ node initialize-empty.mjs على القاعدة الفارغة. كلمة المرور 12 محرفًا على الأقل، ولا توجد كلمة مرور افتراضية. احذف المتغيرين بعد التهيئة.'));
cpSync('qa-results/OPERATIONS_GUIDE.md',path.join(destination,'OPERATIONS_GUIDE.md'));
const files=['OPERATIONS_GUIDE.md','package.json','package-lock.json','start.mjs','initialize-empty.mjs','.env.example','.npmrc','schema-empty.sql','README.md'];
const builtFiles=readdirSync(path.join(destination,'dist'),{recursive:true}).map(name=>path.join('dist',String(name))).filter(name=>statSync(path.join(destination,name)).isFile());
const manifest={createdAt:new Date().toISOString(),status:'CANDIDATE_PENDING_CUSTOMER_ACCEPTANCE',directory:destination,allowlist:['dist',...files],containsProductionData:false,containsLocalEnvironment:false,definitions:definitions.length,foreignKeys:relations.length,files:[...files,...builtFiles].map(name=>({name,sha256:createHash('sha256').update(readFileSync(path.join(destination,name))).digest('hex')}))};
writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest,null,2));
mkdirSync('qa-results',{recursive:true});writeFileSync('qa-results/pilot-package.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({directory:destination,definitions:definitions.length,foreignKeys:relations.length,status:manifest.status}));
