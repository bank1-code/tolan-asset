import express from 'express';
import bcrypt from 'bcryptjs';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {performance} from 'node:perf_hooks';
import {createExpressMiddleware} from '@trpc/server/adapters/express';
import {createTRPCProxyClient,httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
import type mysql from 'mysql2/promise';

// Called only by the disposable-schema harness. No production data is copied.
export async function runAcceptance(db:mysql.Pool){
 const [identity]:any=await db.query('SELECT DATABASE() AS name');
 if(!/^tolan_repair_\d+_[a-f0-9]{8}$/.test(identity[0].name))throw new Error('Isolated schema required');
 const {appRouter}=await import('../server/routers');
 const {createContext}=await import('../server/_core/context');
 const {applySecurityMiddleware,requestValidator}=await import('../server/security');
 const {registerApiBodyParsers}=await import('../server/apiBodyParser');
 const {getDb}=await import('../server/db');
 const password=randomBytes(20).toString('hex'),passwordHash=await bcrypt.hash(password,10);
 await db.query("UPDATE users SET passwordHash=?,role='owner' WHERE id=1",[passwordHash]);
 const [ownerRows]:any=await db.query('SELECT * FROM users WHERE id=1');
 const caller=appRouter.createCaller({user:ownerRows[0],req:{ip:'127.0.0.1',headers:{}},res:{}}as any);
 const site=await caller.settings.locations.create({name:'موقع قبول مستقل',assetPrefix:'AC',custodyPrefix:'CU'});
 const branch=await caller.settings.branches.create({name:'فرع القبول',locationId:site.id});
 const dept=await caller.settings.departments.create({name:'قسم القبول',branchId:branch.id});
 await caller.settings.employees.create({fullName:'موظف القبول',departmentId:dept.id});
 const employee=(await caller.settings.employees.list())[0];
 const classification=await caller.depreciation.createClassification({code:'ACCEPTANCE',name:'أثاث اختبار القبول'});
 for(let i=2;i<=100;i++)await db.query("INSERT INTO users(id,openId,username,passwordHash,name,role,loginMethod) VALUES(?,?,?,?,?,'accountant','local')",[i,`accept-${i}`,`accept-${i}`,passwordHash,`مستخدم قبول ${i}`]);
 for(const kind of ['assets','custody_items']){
  const count=kind==='assets'?10000:5000,nameColumn=kind==='assets'?'assetName':'name',codeColumn=kind==='assets'?'assetCode':'code';
  for(let start=0;start<count;start+=500){
   const rows=Array.from({length:Math.min(500,count-start)},(_,j)=>[`${kind} قبول ${start+j}`,`ACCEPT-${kind}-${start+j}`,1,'1200.00',employee.id,dept.id,site.id,site.id,classification.id,'ACTIVE',1,new Date()]);
   await db.query(`INSERT INTO ${kind} (${nameColumn},${codeColumn},quantity,assetValue,assignedTo,departmentId,locationId,originLocationId,classificationId,status,approvedBy,approvedAt) VALUES ?`,[rows]);
  }
 }
 const app=express();applySecurityMiddleware(app);registerApiBodyParsers(app);app.use(requestValidator);
 app.use('/api/trpc',createExpressMiddleware({router:appRouter,createContext}));
 const server=app.listen(3231,'127.0.0.1');
 const result:any={startedAt:new Date().toISOString(),environment:{database:'isolated disposable full schema',users:100,assets:10000,custody:5000,productionSecurityMiddleware:true,https:false,singleSourceIp:true,hardwareNotConstrainedToReference:true,pageSize:50},checks:[],loads:[],limitations:['قياس محلي مع قاعدة بعيدة، دون تقييد الخادم إلى 4 أنوية و8GB أو اختبار HTTPS.','اختبار اندفاع محدود؛ ليس اختبار تحمل ممتدًا.','جميع الجلسات من IP واحد: يمثل شبكة مؤسسة مشتركة NAT، ولا يمثل مستخدمين موزعين.','بيانات الحجم اصطناعية؛ لم تُنشأ دفعات إهلاك متعددة السنوات في هذا الاختبار، المرجع المالي مستقل.']};
 const client=()=>{let cookie='';return createTRPCProxyClient<typeof appRouter>({links:[httpBatchLink({url:'http://127.0.0.1:3231/api/trpc',maxItems:1,transformer:superjson,fetch:async(url,init)=>{const headers=new Headers(init?.headers);if(cookie)headers.set('cookie',cookie);const response=await fetch(url,{...init,headers});const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.at(-1)!.split(';')[0];return response;}})]});};
 try{
  const clients=Array.from({length:50},client);
  for(let i=0;i<clients.length;i++)await clients[i].localAuth.login.mutate({username:`accept-${i+2}`,password});
  result.checks.push({name:'50 independent authenticated sessions; 100 stored accounts',status:'PASS'});
  const first=await clients[0].inventory.assets.list.query({locationId:site.id,limit:50,offset:0});
  const second=await clients[0].inventory.assets.list.query({locationId:site.id,limit:50,offset:50});
  assert.equal(first.length,50);assert.equal(second.length,50);assert.equal(new Set([...first,...second].map(r=>r.id)).size,100);
  assert.equal(await clients[0].inventory.assets.count.query({locationId:site.id}),10000);
  assert.equal(await clients[0].inventory.custody.count.query({locationId:site.id}),5000);
  assert.equal(await clients[0].inventory.assets.count.query({search:'قسم القبول'}),10000);
  result.checks.push({name:'Server pages have no overlap; counts and joined-field search match 15000 records',status:'PASS'});
  const measure=async(concurrency:number)=>{
   const samples:any[]=[];const started=performance.now();
   await Promise.all(clients.slice(0,concurrency).map(async(c,i)=>{
    for(let round=0;round<3;round++){
     const at=performance.now();try{
      const response=round===0?await c.inventory.assets.list.query({search:`قبول ${i}`,limit:50,offset:0}):round===1?await c.inventory.custody.list.query({search:`قبول ${i}`,limit:50,offset:0}):await c.inventory.assets.list.query({locationId:site.id,limit:50,offset:0});
      samples.push({kind:round===0?'asset-search':round===1?'custody-search':'asset-site-list',milliseconds:Math.round(performance.now()-at),records:response.length,ok:true});
     }catch(error:any){samples.push({kind:round,milliseconds:Math.round(performance.now()-at),ok:false,code:error.data?.code??error.message});}
    }
   }));
   const latencies=samples.filter(r=>r.ok).map(r=>r.milliseconds).sort((a,b)=>a-b);
   result.loads.push({concurrency,requests:samples.length,successful:samples.filter(r=>r.ok).length,failed:samples.filter(r=>!r.ok).length,totalMilliseconds:Math.round(performance.now()-started),median:latencies[Math.floor(latencies.length/2)]??null,p95:latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*.95)-1)]??null,withinTwoSeconds:samples.filter(r=>r.ok&&r.milliseconds<=2000).length,samples});
   writeFileSync('qa-results/acceptance-load.json',JSON.stringify(result,null,2));
   console.log(`Completed ${concurrency} concurrent clients: ${samples.filter(r=>r.ok).length}/${samples.length} successful`);
  };
  await measure(25);await measure(50);
 }finally{
  result.finishedAt=new Date().toISOString();writeFileSync('qa-results/acceptance-load.json',JSON.stringify(result,null,2));
  await new Promise<void>(resolve=>server.close(()=>resolve()));const live:any=await getDb();await live?.$client?.end();
 }
}
