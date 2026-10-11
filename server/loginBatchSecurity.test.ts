import {it,expect,vi} from 'vitest';
import express from 'express';
import {createExpressMiddleware} from '@trpc/server/adapters/express';
import {createTRPCProxyClient,httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
const state=vi.hoisted(()=>({lookups:0}));
vi.mock('./db',()=>({getDb:async()=>({select:()=>({from:()=>({where:()=>({limit:async()=>{state.lookups++;return [];}})})})})}));
vi.mock('./_core/sdk',()=>({sdk:{}}));
import {localAuthRouter} from './routers/localAuth';
import {router,publicProcedure} from './_core/trpc';
import {applySecurityMiddleware} from './security';
import {clearLoginAttempts} from './loginAttempts';
it('charges each login in a mixed HTTP batch before looking up users',async()=>{
 const app=express();app.use(express.json());applySecurityMiddleware(app);
 const routes=router({noop:publicProcedure.mutation(()=>true),localAuth:localAuthRouter});
 app.use('/api/trpc',createExpressMiddleware({router:routes,createContext:({req,res})=>({req,res,user:null})}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const username='batch-boundary-fixture';clearLoginAttempts('127.0.0.1',username);clearLoginAttempts('::ffff:127.0.0.1',username);
 const urls:string[]=[];
 const c=createTRPCProxyClient<typeof routes>({links:[httpBatchLink({url:`http://127.0.0.1:${(server.address()as any).port}/api/trpc`,transformer:superjson,fetch:(url,init)=>{urls.push(String(url));return fetch(url,init);}})]});
 try{
  const requests=[c.noop.mutate(),...Array.from({length:13},()=>c.localAuth.login.mutate({username,password:'wrong-password'}))];
  const results=await Promise.allSettled(requests);
  expect(results[0].status).toBe('fulfilled');expect(urls).toHaveLength(1);expect(urls[0]).toContain('/noop,localAuth.login');
  expect(state.lookups).toBe(10);
  expect(results.filter(r=>r.status==='rejected'&&(r.reason as any).data?.code==='TOO_MANY_REQUESTS')).toHaveLength(3);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));clearLoginAttempts('127.0.0.1',username);clearLoginAttempts('::ffff:127.0.0.1',username);}
});
