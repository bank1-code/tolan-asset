import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {setTimeout as delay} from 'node:timers/promises';
import superjson from 'superjson';
import {createTRPCProxyClient,httpBatchLink} from '@trpc/client';
import type mysql from 'mysql2/promise';

export const baselinePackage='release/pilot-2026-10-07T12-31-52-093Z';

/** Migration and code rollback use only the disposable schema made by the parent harness. */
export async function runUpgrade(db:mysql.Pool){
 const [identity]:any=await db.query('SELECT DATABASE() name');
 assert.match(identity[0].name,/^tolan_repair_\d+_[a-f0-9]{8}$/);
 const manifest=JSON.parse(readFileSync('qa-results/pilot-package.json','utf8'));
 const password=randomBytes(20).toString('hex');
 let secret=randomBytes(40).toString('hex');
 const environment=()=>({...process.env,NODE_ENV:'production',PORT:'3233',APP_HOST:'127.0.0.1',JWT_SECRET:secret,INIT_OWNER_USERNAME:'upgrade-owner',INIT_OWNER_PASSWORD:password});
 const execute=(args:string[],cwd?:string)=>new Promise<number>((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd,env:environment(),stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>resolve(code??1));
 });
 assert.equal(await execute(['initialize-empty.mjs'],baselinePackage),0);
 await db.query("INSERT INTO locations(id,name,assetPrefix,custodyPrefix) VALUES(1,'Upgrade fixture','UP','UC')");
 await db.query("INSERT INTO assets(assetName,assetCode,quantity,assetValue,locationId,originLocationId,status,approvedBy,approvedAt) VALUES('Upgrade asset','UP-TEST',3,'1500.00',1,1,'ACTIVE',1,NOW())");
 const digest=async()=>{
  const [rows]:any=await db.query('SELECT * FROM assets ORDER BY id');
  const [users]:any=await db.query('SELECT id,openId,username,passwordHash,role FROM users ORDER BY id');
  return createHash('sha256').update(JSON.stringify({rows,users})).digest('hex');
 };
 const before=await digest();
 const result:any={startedAt:new Date().toISOString(),baseline:baselinePackage,candidate:manifest.directory,checks:[],limitations:['Only the identified baseline and candidate versions were tested, not arbitrary historical upgrades.','Old baseline may resolve development dependencies from the parent; candidate runs under package-only filesystem permissions.','Rollback keeps the additive session column and rotates JWT_SECRET. Database/file restoration and customer RPO/RTO require their own deployment exercise.']};
 let oldCookie='';
 const run=async(directory:string,strict:boolean,phase:string)=>{
  const args=strict?['--permission',`--allow-fs-read=${directory}`,'--allow-addons','start.mjs']:['start.mjs'];
  const child=spawn(process.execPath,args,{cwd:directory,env:environment(),stdio:'ignore'});
  let exited=false;const stopped=new Promise<void>(resolve=>child.once('exit',()=>{exited=true;resolve()}));
  try{
   let ready=false;
   for(let attempt=0;attempt<60;attempt++){
    if(exited)throw Error(`${phase}: process exited before readiness`);
    try{if((await fetch('http://127.0.0.1:3233/')).ok){ready=true;break}}catch{}
    await delay(250);
   }
   assert.equal(ready,true);
   let cookie='';
   const client=createTRPCProxyClient<any>({links:[httpBatchLink({url:'http://127.0.0.1:3233/api/trpc',maxItems:1,transformer:superjson,fetch:async(url,init)=>{
    const headers=new Headers(init?.headers);if(cookie)headers.set('cookie',cookie);
    const response=await fetch(url,{...init,headers});const values=response.headers.getSetCookie();if(values.length)cookie=values.at(-1)!.split(';')[0];return response;
   }})]});
   if(phase!=='baseline'){
    cookie=oldCookie;assert.equal(await client.auth.me.query(),null);
    result.checks.push({name:`${phase}: baseline cookie denied`,status:'PASS'});
   }
   await client.localAuth.login.mutate({username:'upgrade-owner',password});
   assert.equal((await client.auth.me.query()).username,'upgrade-owner');
   const rows=await client.inventory.assets.list.query({limit:50,offset:0});
   assert.equal(rows.length,1);assert.equal(rows[0].assetCode,'UP-TEST');
   if(phase==='baseline')oldCookie=cookie;
   assert.equal(await digest(),before);
   result.checks.push({name:`${phase}: login and asset bytes preserved`,status:'PASS'});
  }finally{if(!exited)child.kill();await stopped;}
 };
 await run(baselinePackage,false,'baseline');
 assert.equal(await execute(['scripts/apply-session-security-migration.mjs']),0);
 assert.equal(await execute(['scripts/apply-session-security-migration.mjs']),0);
 result.checks.push({name:'Additive migration is repeatable and preserves fixture bytes',status:'PASS'});
 await run(manifest.directory,true,'upgrade');
 secret=randomBytes(40).toString('hex');
 await run(baselinePackage,false,'rollback');
 result.finishedAt=new Date().toISOString();writeFileSync('qa-results/acceptance-upgrade.json',JSON.stringify(result,null,2));
 console.log(`PASS: ${result.checks.length} cross-version upgrade and rollback checks`);
}
