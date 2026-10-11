import 'dotenv/config';
import {S3Client,DeleteObjectCommand,GetBucketAclCommand,GetBucketPolicyCommand} from '@aws-sdk/client-s3';
import {randomUUID} from 'node:crypto';
import {strict as assert} from 'node:assert';
import {writeFileSync} from 'node:fs';
import {storagePut,storageGet} from '../server/storage';
const required=['IDRIVE_E2_ENDPOINT','IDRIVE_E2_BUCKET','IDRIVE_E2_ACCESS_KEY_ID','IDRIVE_E2_SECRET_ACCESS_KEY'];
if(!required.every(name=>Boolean(process.env[name])))throw Error('IDrive configuration required; no provider fallback certification');
const client=new S3Client({endpoint:process.env.IDRIVE_E2_ENDPOINT,region:process.env.IDRIVE_E2_REGION||'us-east-1',forcePathStyle:true,credentials:{accessKeyId:process.env.IDRIVE_E2_ACCESS_KEY_ID!,secretAccessKey:process.env.IDRIVE_E2_SECRET_ACCESS_KEY!}});
const key=`documents/archive/qa-security-${randomUUID()}.pdf`,data=Buffer.from('%PDF-1.4\n% Tolan private-storage disposable test\n%%EOF');
let uploaded=false;
try {
 const stored=await storagePut(key,data,'application/pdf');uploaded=true;
 assert.ok(stored.url.startsWith('/api/files/'));
 const {url}=await storageGet(key);const authorized=await fetch(url);assert.equal(authorized.status,200);assert.ok(Buffer.from(await authorized.arrayBuffer()).equals(data));
 const unsigned=new URL(url);unsigned.search='';const anonymous=await fetch(unsigned,{redirect:'manual'});
 const anonymousBytes=Buffer.from(await anonymous.arrayBuffer());
 const acl=await client.send(new GetBucketAclCommand({Bucket:process.env.IDRIVE_E2_BUCKET!}));
 const publicAcl=(acl.Grants||[]).some(grant=>grant.Grantee?.Type==='Group'&&/AllUsers|AuthenticatedUsers/.test(grant.Grantee.URI||''));
 let publicPolicy=false;
 try { const policy=await client.send(new GetBucketPolicyCommand({Bucket:process.env.IDRIVE_E2_BUCKET!}));const statements=JSON.parse(policy.Policy||'{"Statement":[]}').Statement;publicPolicy=statements.some((statement:any)=>statement.Effect==='Allow'&&(statement.Principal==='*'||statement.Principal?.AWS==='*')); }
 catch(error:any){if(!['NoSuchBucketPolicy','NoSuchPolicy'].includes(error.name))throw Error('Unable to certify storage bucket policy');}
 const privateObject=!publicAcl&&!publicPolicy&&([401,403,404].includes(anonymous.status)||(anonymous.status===302&&!anonymousBytes.equals(data)));
 writeFileSync('qa-results/commercial-storage.json',JSON.stringify({verifiedAt:new Date().toISOString(),tests:[{name:'Live PDF upload returns application-gated URL',status:'PASS'},{name:'Signed download reproduces exact uploaded bytes',status:'PASS'},{name:'Unsigned request to the same actual object is denied',status:privateObject?'PASS':'FAIL',httpStatus:anonymous.status}],containsSecrets:false},null,2));
 console.log(JSON.stringify({anonymousStatus:anonymous.status,redirected:anonymous.redirected,returnedObjectBytes:anonymousBytes.equals(data),privateObject}));assert.ok(privateObject,'Anonymous storage access must be denied');
 console.log(JSON.stringify({liveStorageChecks:3,failed:0,anonymousStatus:anonymous.status}));
} finally {
 if(uploaded){await client.send(new DeleteObjectCommand({Bucket:process.env.IDRIVE_E2_BUCKET!,Key:key}));console.log('Only the uniquely generated disposable QA object was removed.');}
 client.destroy();
}
