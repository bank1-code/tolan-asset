import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
const mocked=vi.hoisted(()=>({exchange:vi.fn(async()=>({accessToken:'qa'})),info:vi.fn(async()=>({openId:'qa-oauth',name:'QA'})),issue:vi.fn(async()=> 'qa-session'),upsert:vi.fn()}));
vi.mock('./db',()=>({upsertUser:mocked.upsert}));
vi.mock('./_core/sdk',()=>({sdk:{exchangeCodeForToken:mocked.exchange,getUserInfo:mocked.info,createSessionToken:mocked.issue}}));
import { registerOAuthRoutes } from './_core/oauth';
afterEach(()=>vi.unstubAllEnvs());
it('disables unused OAuth; configured callbacks require browser-bound single-use state',async()=>{
 vi.stubEnv('OAUTH_ENABLED','false');const disabled=express();registerOAuthRoutes(disabled);
 expect((disabled as any)._router).toBeUndefined();
 vi.stubEnv('OAUTH_ENABLED','true');vi.stubEnv('OAUTH_PORTAL_URL','https://oauth.example/');vi.stubEnv('OAUTH_REDIRECT_URI','https://tolan.example/api/oauth/callback');vi.stubEnv('OAUTH_SERVER_URL','https://oauth.example/');vi.stubEnv('VITE_APP_ID','qa');
 const app=express();app.set('trust proxy',true);registerOAuthRoutes(app);const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try {
  const start=await fetch(base+'/api/oauth/start',{redirect:'manual'});const state=new URL(start.headers.get('location')!).searchParams.get('state')!;const cookie=start.headers.get('set-cookie')!.split(';')[0];
  expect((await fetch(base+`/api/oauth/callback?code=qa&state=${state}`,{redirect:'manual'})).status).toBe(400);expect(mocked.exchange).not.toHaveBeenCalled();
  expect((await fetch(base+`/api/oauth/callback?code=qa&state=${state}`,{headers:{cookie},redirect:'manual'})).status).toBe(302);expect(mocked.exchange).toHaveBeenCalledWith('qa',btoa('https://tolan.example/api/oauth/callback'));
  expect((await fetch(base+`/api/oauth/callback?code=qa&state=${state}`,{headers:{cookie},redirect:'manual'})).status).toBe(400);expect(mocked.exchange).toHaveBeenCalledTimes(1);
  for(let i=0;i<50;i++)expect((await fetch(base+'/api/oauth/start',{headers:{'x-forwarded-for':'192.0.2.1'},redirect:'manual'})).status).toBe(302);
  expect((await fetch(base+'/api/oauth/start',{headers:{'x-forwarded-for':'192.0.2.1'},redirect:'manual'})).status).toBe(429);
  expect((await fetch(base+'/api/oauth/start',{headers:{'x-forwarded-for':'192.0.2.2'},redirect:'manual'})).status).toBe(302);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
