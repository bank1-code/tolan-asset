import {expect,it,vi} from 'vitest';
import express from 'express';
vi.mock('./_core/sdk',()=>({sdk:{authenticateRequest:vi.fn(async(req:any)=>{const token=req.headers.cookie?.split('=')[1];if(token==='operator')return{id:1,role:'accountant'};if(token==='employee')return{id:2,role:'employee'};throw Error('Invalid cookie');})}}));
import {registerApiBodyParsers} from './apiBodyParser';
import {applySecurityMiddleware} from './security';
it('bounds anonymous/employee JSON before bulk parsing and rejects foreign-origin mutations',async()=>{
 const app=express();applySecurityMiddleware(app);registerApiBodyParsers(app);app.post('/api/probe',(_req,res)=>res.json({success:true}));
 app.use((err:any,_req:any,res:any,_next:any)=>res.sendStatus(err.status||500));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 const request=(cookie='',origin?:string)=>fetch(base+'/api/probe',{method:'POST',headers:{'content-type':'application/json',cookie,...(origin?{origin}:{})},body:JSON.stringify({value:'x'.repeat(70_000)})});
 try {
  expect((await request()).status).toBe(413);expect((await request('app_session_id=forged')).status).toBe(413);expect((await request('app_session_id=employee')).status).toBe(413);
  expect((await request('app_session_id=operator',base)).status).toBe(200);expect((await request('app_session_id=operator','https://foreign.example')).status).toBe(403);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
