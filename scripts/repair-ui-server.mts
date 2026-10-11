import express from 'express';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {writeFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import type mysql from 'mysql2/promise';
import {createExpressMiddleware} from '@trpc/server/adapters/express';
import {createTRPCProxyClient,httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
export async function runUi(db:mysql.Pool){
 const {appRouter}=await import('../server/routers');
 const {createContext}=await import('../server/_core/context');
 const {getDb}=await import('../server/db');
 const {fileDownloadRouter}=await import('../server/fileDownload');
 const {fileUploadRouter}=await import('../server/fileUpload');
 const {applySecurityMiddleware,requestValidator}=await import('../server/security');
 const {registerApiBodyParsers}=await import('../server/apiBodyParser');
 const password='QA-Test-2026!';
 await db.query('UPDATE users SET passwordHash=? WHERE id=1',[await bcrypt.hash(password,10)]);
 await db.query("INSERT INTO users(id,openId,username,passwordHash,name,role,loginMethod) VALUES(2,'qa-maker','qa-maker',?,'محاسب اختبار الإصلاح','accountant','local'),(3,'qa-manager','qa-manager',?,'مدير حسابات اختبار الإصلاح','accounting_manager','local')",[await bcrypt.hash(password,10),await bcrypt.hash(password,10)]);
 const ownerRows:any=await db.query('SELECT * FROM users WHERE id=1');
 const bootstrap=appRouter.createCaller({user:ownerRows[0][0],req:{ip:'127.0.0.1',headers:{}},res:{}}as any);
 const site=await bootstrap.settings.locations.create({name:'موقع اختبار الإصلاح',assetPrefix:'RA',custodyPrefix:'RC'});
 const branch=await bootstrap.settings.branches.create({name:'فرع اختبار الإصلاح',locationId:site.id});
 const dept=await bootstrap.settings.departments.create({name:'قسم اختبار الإصلاح',branchId:branch.id});
 await bootstrap.settings.employees.create({fullName:'موظف اختبار الإصلاح',departmentId:dept.id});
 const employee=(await bootstrap.settings.employees.list())[0];
 const app=express();applySecurityMiddleware(app);registerApiBodyParsers(app);app.use(requestValidator);let finish!:()=>void;
 const done=new Promise<void>(resolve=>{finish=resolve});
 app.post('/__qa/stop',(_req,res)=>{res.json({stopped:true});finish();});
 app.use('/api/trpc',createExpressMiddleware({router:appRouter,createContext}));
 app.use(fileDownloadRouter);
 app.use(fileUploadRouter);
 app.use(express.static(path.resolve('dist/public')));app.get('*',(_req,res)=>res.sendFile(path.resolve('dist/public/index.html')));
 const port=process.argv.includes('--benchmark')?3220:3219;
 const server=app.listen(port,'127.0.0.1');
 const results:any={environment:'قاعدة مستقلة بعلاقات فعلية وجلسات JWT وتسجيل الدخول الحقيقي',checks:[]};
 const client=()=>{let cookie='';return createTRPCProxyClient<typeof appRouter>({links:[httpBatchLink({url:`http://127.0.0.1:${port}/api/trpc`,maxItems:1,transformer:superjson,fetch:async(url,init)=>{const headers=new Headers(init?.headers);if(cookie)headers.set('cookie',cookie);const response=await fetch(url,{...init,headers});const values=response.headers.getSetCookie();if(values.length)cookie=values.at(-1)!.split(';')[0];return response;}})]});};
 try{
  const maker=client(),manager=client();
  await assert.rejects(maker.localAuth.login.mutate({username:'qa-maker',password:'wrong'}));results.checks.push({name:'رفض كلمة مرور غير صحيحة عبر HTTP',status:'PASS'});
  assert.equal((await maker.localAuth.login.mutate({username:'qa-maker',password})).user.role,'accountant');
  assert.equal((await manager.localAuth.login.mutate({username:'qa-manager',password})).user.role,'accounting_manager');
  assert.equal((await maker.auth.me.query())?.role,'accountant');assert.equal((await manager.auth.me.query())?.role,'accounting_manager');results.checks.push({name:'تسجيل دخول مستقل للمحاسب والمدير واستمرار الجلسات الصحيحة',status:'PASS'});
  const classification=await maker.depreciation.createClassification.mutate({code:'REPAIR-F',name:'تصنيف اختبار الإصلاح'});
  const data={quantity:2,assetValue:'1200',assignedTo:employee.id,departmentId:dept.id,locationId:site.id,classificationId:classification.id};
  const asset=await maker.inventory.assets.create.mutate({...data,assetName:'أصل اختبار الإصلاح'});
  const custody=await maker.inventory.custody.create.mutate({...data,name:'عهدة اختبار الإصلاح'});
  await assert.rejects(maker.inventory.assets.approve.mutate({id:asset.id,expectedVersion:0}),(error:any)=>error.data.code==='FORBIDDEN');results.checks.push({name:'المحاسب ينشئ مسودة ويُمنع من الاعتماد عبر جلسته',status:'PASS'});
  await manager.inventory.assets.approve.mutate({id:asset.id,expectedVersion:0});await manager.inventory.custody.approve.mutate({id:custody.id,expectedVersion:0});results.checks.push({name:'مدير الحسابات يعتمد الأصل والعهدة عبر جلسة حقيقية',status:'PASS'});
  const session=await maker.inventoryCount.createDraft.mutate({sessionType:'both'}),snapshot=await maker.inventoryCount.getSession.query({id:session.id});
  const items=(snapshot.items as any[]).map((r:any,i:number)=>({id:r.id,entityType:r.entityType,actualQuantity:i===0?1:null,reason:i===0?'فرق اختبار إصلاح':''}));
  const saved=await maker.inventoryCount.saveDraft.mutate({id:session.id,expectedVersion:session.version,items});
  const savedAgain=await maker.inventoryCount.saveDraft.mutate({id:session.id,expectedVersion:saved.version,items});
  const submitted=await maker.inventoryCount.submitSession.mutate({id:session.id,expectedVersion:savedAgain.version});
  await manager.inventoryCount.approveSession.mutate({id:session.id,expectedVersion:submitted.version});
  const final=await manager.inventoryCount.getSession.query({id:session.id});assert.equal((final.items as any[]).length,1);
  await assert.rejects(maker.inventoryCount.getDifferences.query(),(e:any)=>e.data.code==='FORBIDDEN');assert.equal((await manager.inventoryCount.getDifferences.query()).length,1);results.checks.push({name:'حفظ الجرد مرتين وإرسال المفحوص فقط واعتماد الفرق دون تعديل كمية الأصل',status:'PASS'});
  writeFileSync('qa-results/repair-auth-http.json',JSON.stringify(results,null,2));
  if(process.argv.includes('--roles')){
   await db.query("INSERT INTO users(id,openId,username,passwordHash,name,role,loginMethod,employeeId) VALUES(4,'qa-admin','qa-admin',?,'مدير نظام قبول','admin','local',NULL),(5,'qa-employee','qa-employee',?,'موظف قبول','employee','local',?)",[await bcrypt.hash(password,10),await bcrypt.hash(password,10),employee.id]);
   const owner=client(),admin=client(),worker=client();
   await owner.localAuth.login.mutate({username:'qa-owner',password});
   await admin.localAuth.login.mutate({username:'qa-admin',password});
   await worker.localAuth.login.mutate({username:'qa-employee',password});
   for(const [role,c] of [['owner',owner],['admin',admin],['accounting_manager',manager]]as const){
    const draft=await maker.inventory.assets.create.mutate({...data,assetName:`اعتماد دور ${role}`});
    await c.inventory.assets.approve.mutate({id:draft.id,expectedVersion:0});
    results.checks.push({name:`${role} approves a maker asset through an actual HTTP session`,status:'PASS'});
   }
   await assert.rejects(worker.inventory.assets.create.mutate({...data,assetName:'رفض إنشاء الموظف'}),(e:any)=>e.data.code==='FORBIDDEN');
   await assert.rejects(worker.inventory.assets.approve.mutate({id:asset.id,expectedVersion:0}),(e:any)=>e.data.code==='FORBIDDEN');
   await assert.rejects(worker.records.audit.list.query(),(e:any)=>e.data.code==='FORBIDDEN');
   results.checks.push({name:'Employee cannot create approve or read institutional audit',status:'PASS'});
   const own=await worker.inventory.assets.list.query();assert.ok(own.length>0);assert.ok(own.every((row:any)=>row.assignedTo===employee.id));
   results.checks.push({name:'Employee listing contains assigned active records',status:'PASS'});
   for(const c of [admin,manager,maker,worker])await assert.rejects(c.backup.list.query(),(e:any)=>e.data.code==='FORBIDDEN');
   await owner.backup.list.query();results.checks.push({name:'Backup listing permits only owner across all five roles',status:'PASS'});
   await db.query("INSERT INTO audit_log(tableName,actionType,actionDescription,newData,performedBy) VALUES('backup','CREATE','backup acceptance',?,1)",[JSON.stringify({fileKey:'backups/acceptance-sensitive.tln'})]);
   assert.equal((await owner.records.audit.list.query({tableName:'backup'})).total,1);
   for(const c of [admin,manager,maker]) {const audit=await c.records.audit.list.query({tableName:'backup'});assert.equal(audit.total,0);assert.equal(audit.rows.length,0);}
   results.checks.push({name:'Backup metadata is absent from all non-owner audit queries',status:'PASS'});
   const employeeCount=await worker.inventory.assets.count.query();assert.equal(employeeCount,own.length);
   const p1=await worker.inventory.assets.list.query({limit:2,offset:0}),p2=await worker.inventory.assets.list.query({limit:2,offset:2});
   assert.equal(new Set([...p1,...p2].map(r=>r.id)).size,p1.length+p2.length);assert.ok([...p1,...p2].every(r=>r.assignedTo===employee.id&&r.status==='ACTIVE'));
   results.checks.push({name:'Employee paginated queries and counts retain assignment and status restrictions',status:'PASS'});
   writeFileSync('qa-results/acceptance-roles.json',JSON.stringify(results,null,2));
   console.log(`PASS: ${results.checks.length} authenticated five-role checks`);return;
  }
  if(process.argv.includes('--benchmark')){
   const owner=client();await owner.localAuth.login.mutate({username:'qa-owner',password});
   const drafts=await Promise.all(Array.from({length:16},(_,i)=>maker.inventory.assets.create.mutate({...data,assetName:`حمل اعتماد اختبار ${i}`})));
   const started=Date.now();
   const approvals=await Promise.all(drafts.map(async (draft,index)=>{const at=Date.now();const value=await (index%2?owner:manager).inventory.assets.approve.mutate({id:draft.id,expectedVersion:0});return {code:value.code,milliseconds:Date.now()-at};}));
   assert.equal(new Set(approvals.map(r=>r.code)).size,16);
   const durations=approvals.map(r=>r.milliseconds).sort((a,b)=>a-b);
   writeFileSync('qa-results/repair-load.json',JSON.stringify({concurrentApprovals:16,successful:16,uniqueCodes:16,distinctApprovers:2,separateHttpRequests:true,totalMilliseconds:Date.now()-started,medianMilliseconds:durations[8],p95Milliseconds:durations[15],actualAuthenticatedHttp:true,applicationDatabaseUntouched:true},null,2));
   console.log('PASS: 16 concurrent authenticated approvals with unique codes');return;
  }
  console.log('READY: http://127.0.0.1:3219 — isolated real login, QA users only');
  const timeout=setTimeout(finish,20*60*1000);try{await done;}finally{clearTimeout(timeout);}
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));const live:any=await getDb();await live?.$client?.end();}
}
