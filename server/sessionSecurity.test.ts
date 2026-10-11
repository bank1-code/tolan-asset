import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, decodeJwt } from 'jose';
import { COOKIE_NAME, SESSION_TTL_MS } from '../shared/const';
const state=vi.hoisted(()=>({users:new Map<string,any>(),revoke:vi.fn(),byUsername:vi.fn(),byOpenId:vi.fn()}));
vi.mock('./_core/env',()=>({ENV:{cookieSecret:'security-fixture-key-32-characters-long',appId:'security-fixture',oAuthServerUrl:''}}));
vi.mock('./db',()=>({
 getUserByOpenId:state.byOpenId,getUserByUsername:state.byUsername,
 initializeSessionVersion:async(id:string)=>{const user=state.users.get(id);if(!user)throw Error('Account unavailable');if(!user.sessionVersion)user.sessionVersion=crypto.randomUUID();return user;},
 revokeUserSessions:state.revoke,upsertUser:vi.fn(),getDb:async()=>null
}));
import { sdk } from './_core/sdk';
import { appRouter } from './routers';
const request=(token:string)=>({headers:{cookie:`${COOKIE_NAME}=${token}`}} as any);
beforeEach(()=>{state.users.clear();state.byUsername.mockClear();state.byOpenId.mockReset().mockImplementation(async(id:string)=>state.users.get(id));state.revoke.mockImplementation(async(id:number)=>{for(const user of state.users.values())if(user.id===id)user.sessionVersion=crypto.randomUUID();});state.users.set('immutable-a',{id:1,openId:'immutable-a',username:'reusable',name:'A',role:'employee',sessionVersion:'epoch-a',lastSignedIn:new Date()});});
describe('persisted session identity and revocation',()=>{
 it('shares authentication only within one request and refreshes authority on the next',async()=>{
  const token=await sdk.createSessionToken('immutable-a');const req=request(token);
  await Promise.all([sdk.authenticateRequest(req),sdk.authenticateRequest(req)]);
  expect(state.byOpenId).toHaveBeenCalledTimes(1);
  state.users.set('immutable-a',{...state.users.get('immutable-a'),role:'accountant'});
  expect((await sdk.authenticateRequest(request(token))).role).toBe('accountant');
  expect(state.byOpenId).toHaveBeenCalledTimes(2);
  state.users.get('immutable-a').sessionVersion='revoked';
  await expect(sdk.authenticateRequest(request(token))).rejects.toThrow();
 });
 it('issues immutable principals with at most eight hours and rejects missing epochs',async()=>{
  const token=await sdk.createSessionToken('immutable-a');const payload=decodeJwt(token);
  expect(payload.openId).toBe('immutable-a');expect(Number(payload.exp)-Number(payload.iat)).toBeLessThanOrEqual(SESSION_TTL_MS/1000);
  expect((await sdk.authenticateRequest(request(token))).id).toBe(1);
  const legacy=await new SignJWT({openId:'reusable',appId:'security-fixture',name:'A'}).setProtectedHeader({alg:'HS256'}).setExpirationTime('1h').sign(new TextEncoder().encode('security-fixture-key-32-characters-long'));
  expect(await sdk.verifySession(legacy)).toBeNull();expect(state.byUsername).not.toHaveBeenCalled();
 });
 it('reused usernames never rebind or resurrect a deleted identity',async()=>{
  const token=await sdk.createSessionToken('immutable-a');state.users.delete('immutable-a');state.users.set('immutable-b',{id:2,openId:'immutable-b',username:'reusable',name:'B',role:'admin',sessionVersion:'epoch-b'});
  expect(await sdk.verifySession(token)).toBeNull();await expect(sdk.authenticateRequest(request(token))).rejects.toThrow();expect(state.byUsername).not.toHaveBeenCalled();
 });
 it('logout revokes replayed cookies and keeps new login usable',async()=>{
  const token=await sdk.createSessionToken('immutable-a');const user=await sdk.authenticateRequest(request(token));const clearCookie=vi.fn();
  await appRouter.createCaller({user,req:{protocol:'https',headers:{}},res:{clearCookie}} as any).auth.logout();
  expect(state.revoke).toHaveBeenCalledWith(1);expect(clearCookie).toHaveBeenCalled();expect(await sdk.verifySession(token)).toBeNull();
  expect(await sdk.verifySession(await sdk.createSessionToken('immutable-a'))).not.toBeNull();
 });
 it('rejects changed epochs wrong app signatures and expired tokens',async()=>{
  const token=await sdk.createSessionToken('immutable-a');state.users.get('immutable-a').sessionVersion='changed';expect(await sdk.verifySession(token)).toBeNull();
  expect(await sdk.verifySession(await sdk.signSession({openId:'immutable-a',appId:'another-app',name:'A',sessionVersion:'changed'}))).toBeNull();
  expect(await sdk.verifySession(await sdk.createSessionToken('immutable-a',{expiresInMs:-10000}))).toBeNull();expect(await sdk.verifySession(token+'forged')).toBeNull();
 });
 it('never lends a reset epoch to login verified against an old password hash',async()=>{
  state.users.get('immutable-a').passwordHash='reset-hash';state.users.get('immutable-a').sessionVersion='reset-epoch';
  await expect(sdk.createSessionToken('immutable-a',{credentialHash:'old-verified-hash'})).rejects.toThrow('Credentials changed');
  expect(await sdk.verifySession(await sdk.createSessionToken('immutable-a',{credentialHash:'reset-hash'}))).not.toBeNull();
 });
});
