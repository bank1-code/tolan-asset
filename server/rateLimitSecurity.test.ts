import {it,expect,vi} from 'vitest';
import express from 'express';
import {COOKIE_NAME} from '../shared/const';
vi.mock('./_core/sdk',()=>({sdk:{authenticateRequest:vi.fn(async(req:any)=>{const token=req.headers.cookie?.split('=')[1];if(token==='a'||token==='a-renewed')return {id:1};if(token==='b')return{id:2};throw Error('Invalid cookie');})}}));
import {rateLimiter} from './security';
it('separates verified users behind one IP and rejects forged cookie identities',async()=>{
 const app=express();app.use(rateLimiter(2,60000));app.get('*',(_req,res)=>res.sendStatus(200));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address()as any).port}`;
 const get=(token:string,path='/query')=>fetch(base+path,{headers:{cookie:`${COOKIE_NAME}=${token}`}}).then(r=>r.status);
 try{
  expect(await get('a')).toBe(200);expect(await get('a-renewed')).toBe(200);expect(await get('a')).toBe(429);
  expect(await get('b')).toBe(200);expect(await get('b')).toBe(200);expect(await get('b')).toBe(429);
  expect(await get('fake-a')).toBe(200);expect(await get('fake-b')).toBe(200);expect(await get('fake-c')).toBe(429);
  expect(await get('a','/trpc/localAuth.login')).toBe(429);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
