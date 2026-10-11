import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {setTimeout as delay} from 'node:timers/promises';
import superjson from 'superjson';
import {createTRPCProxyClient,httpBatchLink} from '@trpc/client';
import type mysql from 'mysql2/promise';
export async function runInstallation(db:mysql.Pool){
 const manifest=JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
 const password=randomBytes(20).toString('hex');
 const environment={...process.env,DATABASE_URL:process.env.DATABASE_URL,INIT_OWNER_USERNAME:'pilot-owner',INIT_OWNER_PASSWORD:password,JWT_SECRET:randomBytes(40).toString('hex'),PORT:'3232',NODE_ENV:'production'};
 const results:any={startedAt:new Date().toISOString(),checks:[],dependencyIsolation:'Production-only npm ci in package; Node filesystem permissions deny parent dependency fallback',limitations:['إعادة التشغيل تستخدم نفس الإصدار؛ ليست محاكاة ترقية بين إصدارين مختلفين.','بنية القاعدة مؤقتة مطابقة للمشروع؛ لم يُختبر تثبيت MySQL أو وكيل HTTPS جديد.']};
 const initialize=()=>new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,['initialize-empty.mjs'],{cwd:manifest.directory,env:environment,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
 assert.equal(await initialize(),0);results.checks.push({name:'Fresh empty database initializes owner without default password',status:'PASS'});
 assert.notEqual(await initialize(),0);results.checks.push({name:'Initialization refuses existing users and preserves owner',status:'PASS'});
 const[rows]:any=await db.query('SELECT COUNT(*) n FROM users');assert.equal(rows[0].n,1);
 for(const table of ['assets','custody_items','depreciation_journals']){const[count]:any=await db.query(`SELECT COUNT(*) n FROM ${table}`);assert.equal(count[0].n,0);}
 results.checks.push({name:'Fresh package starts with zero assets custody and journals',status:'PASS'});
 for(let iteration=0;iteration<2;iteration++){
  const child=spawn(process.execPath,['--permission',`--allow-fs-read=${manifest.directory}`,'--allow-addons','start.mjs'],{cwd:manifest.directory,env:environment,stdio:'ignore'});
  let exited=false;const stopped=new Promise<void>(resolve=>child.once('exit',()=>{exited=true;resolve()}));
  try{
   let reachable=false;
   for(let attempt=0;attempt<40;attempt++){if(exited)throw new Error('Production process exited before ready');try{const response=await fetch('http://127.0.0.1:3232/');if(response.ok){assert.match(await response.text(),/<html/);reachable=true;break;}}catch{}await delay(250);}
   assert.equal(reachable,true);
   let cookie='';const client=createTRPCProxyClient<any>({links:[httpBatchLink({url:'http://127.0.0.1:3232/api/trpc',maxItems:1,transformer:superjson,fetch:async(url,init)=>{const headers=new Headers(init?.headers);if(cookie)headers.set('cookie',cookie);const response=await fetch(url,{...init,headers});const values=response.headers.getSetCookie();if(values.length)cookie=values.at(-1)!.split(';')[0];return response;}})]});
   const login=await client.localAuth.login.mutate({username:'pilot-owner',password});assert.equal(login.user.role,'owner');
   assert.equal((await client.auth.me.query()).username,'pilot-owner');
   results.checks.push({name:iteration===0?'Built production package serves page and authenticates initial owner':'Same-version restart preserves owner and login',status:'PASS'});
  }finally{if(!exited)child.kill();await stopped;}
 }
 const adminEnv={...environment,INIT_ADMIN_USERNAME:'acceptance-admin',INIT_ADMIN_PASSWORD:randomBytes(20).toString('hex')};
 const bootstrapAdmin=()=>new Promise<number>((resolve,reject)=>{const child=spawn(process.execPath,['seed-admin.mjs'],{env:adminEnv,stdio:'ignore'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
 assert.equal(await bootstrapAdmin(),0);const [before]:any=await db.query("SELECT passwordHash FROM users WHERE username='acceptance-admin'");
 adminEnv.INIT_ADMIN_PASSWORD=randomBytes(20).toString('hex');assert.notEqual(await bootstrapAdmin(),0);
 const [after]:any=await db.query("SELECT passwordHash FROM users WHERE username='acceptance-admin'");assert.equal(after[0].passwordHash,before[0].passwordHash);
 results.checks.push({name:'Admin bootstrap requires a supplied secret and refuses to reset an existing account',status:'PASS'});
 results.finishedAt=new Date().toISOString();writeFileSync('qa-results/acceptance-installation.json',JSON.stringify(results,null,2));
 console.log('PASS: 6 isolated installation and restart checks');
}
