import {TRPCError} from '@trpc/server';
const attempts=new Map<string,{count:number;resetAt:number}>();
const WINDOW=15*60*1000;
const LIMIT=10;
function keys(ip:string,username:string){return [`ip:${ip}`,`account:${username.trim().toLowerCase()}`];}
/** Count each actual invocation, including multiple calls within one HTTP batch. */
export function takeLoginAttempt(ip:string,username:string,now=Date.now()):void {
  if(attempts.size>10000){for(const [key,value]of attempts)if(value.resetAt<=now)attempts.delete(key);}
  const list=keys(ip,username);
  if(list.some(key=>{const entry=attempts.get(key);return entry&&entry.resetAt>now&&entry.count>=LIMIT;}))throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'محاولات دخول متكررة؛ حاول بعد 15 دقيقة'});
  if(attempts.size>=20000&&!list.every(key=>attempts.has(key)))throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'محاولات دخول متكررة؛ حاول لاحقًا'});
  for(const key of list){const entry=attempts.get(key);attempts.set(key,entry&&entry.resetAt>now?{...entry,count:entry.count+1}:{count:1,resetAt:now+WINDOW});}
}
export function clearLoginAttempts(ip:string,username:string){for(const key of keys(ip,username))attempts.delete(key);}
