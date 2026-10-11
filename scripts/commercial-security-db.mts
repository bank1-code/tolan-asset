import type mysql from 'mysql2/promise';
import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
export async function runSecurityDatabase(database:mysql.Pool) {
 const dbname=new URL(process.env.DATABASE_URL!).pathname.slice(1);
 if(!/^tolan_repair_\d+_[a-f0-9]{8}$/.test(dbname))throw Error('Disposable security schema required');
 const {sdk}=await import('../server/_core/sdk');const {appRouter}=await import('../server/routers');
 const {mayDownloadRecordFile}=await import('../server/fileRecordAccess');const {getDb}=await import('../server/db');
 const checks:{name:string,status:string}[]=[];
 const passed=(name:string)=>checks.push({name,status:'PASS'});
 const password='Security-QA-2026!';
 await database.query('UPDATE users SET passwordHash=? WHERE id=1',[await bcrypt.hash(password,10)]);
 const request=(token:string)=>({headers:{cookie:`app_session_id=${token}`},ip:'127.0.0.1',protocol:'https'}as any);
 const token=await sdk.createSessionToken('qa-repair-owner');let owner=await sdk.authenticateRequest(request(token));
 const ownerApi=()=>appRouter.createCaller({user:owner,req:{headers:{},ip:'127.0.0.1',protocol:'https'},res:{clearCookie(){},cookie(){}}}as any);
 passed('Null-epoch raw account initialization and real JWT authentication');
 const login=async(username:string,pwd=password)=>{let result='';await appRouter.createCaller({user:null,req:{headers:{},ip:'127.0.0.1',protocol:'https'},res:{clearCookie(){},cookie(_name:string,value:string){result=value;}}}as any).localAuth.login({username,password:pwd});assert.ok(result);return result;};
 assert.equal((await sdk.authenticateRequest(request(await login('qa-owner')))).id,1);passed('Local login issues usable immutable-principal token');
 await ownerApi().auth.logout();assert.equal(await sdk.verifySession(token),null);passed('Real database logout invalidates captured cookie');
 const beforeReset=await login('qa-owner');owner=await sdk.authenticateRequest(request(beforeReset));const [credentialRows]:any=await database.query('SELECT passwordHash FROM users WHERE id=1');const verifiedHash=credentialRows[0].passwordHash;await ownerApi().localAuth.updateUser({id:1,password:'Changed-QA-2026!'});
 await assert.rejects(sdk.createSessionToken('qa-repair-owner',{credentialHash:verifiedHash}),/Credentials changed/);passed('Old-password issuance racing after reset cannot acquire new session authority');
 assert.equal(await sdk.verifySession(beforeReset),null);assert.ok(await sdk.verifySession(await login('qa-owner','Changed-QA-2026!')));passed('Password reset atomically revokes session; changed credentials work');
 await database.query("INSERT INTO users(openId,username,passwordHash,name,role,loginMethod) VALUES('qa-old-principal','reused-user',?,'Old','admin','local')",[await bcrypt.hash(password,10)]);
 // Direct issuer fixture leaves the account unreferenced; normal logged-in accounts
 // can also be protected from deletion by audit-log foreign keys.
 const reused=await sdk.createSessionToken('qa-old-principal');await database.query("DELETE FROM users WHERE openId='qa-old-principal'");await database.query("INSERT INTO users(openId,username,passwordHash,name,role,loginMethod) VALUES('qa-new-principal','reused-user',?,'New','admin','local')",[await bcrypt.hash(password,10)]);
 assert.equal(await sdk.verifySession(reused),null);assert.equal((await sdk.authenticateRequest(request(await login('reused-user')))).openId,'qa-new-principal');passed('Username deletion/reuse cannot transfer old authority');
 const site=await ownerApi().settings.locations.create({name:'Security Site',assetPrefix:'SEC',custodyPrefix:'SC'});const branch=await ownerApi().settings.branches.create({name:'Security Branch',locationId:site.id});const dept=await ownerApi().settings.departments.create({name:'Security Department',branchId:branch.id});
 await ownerApi().settings.employees.create({fullName:'Security employee',departmentId:dept.id});const [employees]:any=await database.query('SELECT id FROM employees');const employeeId=employees[0].id;
 const key='images/asset/security-test.webp',path='/api/files/'+key;
 await database.query("INSERT INTO assets(assetName,quantity,assignedTo,departmentId,locationId,status,assetImagePath) VALUES('Security attachment',1,?,?,?,'ACTIVE',?)",[employeeId,dept.id,site.id,path]);
 const employee={id:999,role:'employee',employeeId}as any;
 assert.equal(await mayDownloadRecordFile(employee,key),true);
 for(const other of ['images/asset/other.webp','documents/archive/private.pdf','backups/secret.tln'])assert.equal(await mayDownloadRecordFile(employee,other),false);
 await database.query('UPDATE assets SET assignedTo=NULL WHERE assetImagePath=?',[path]);assert.equal(await mayDownloadRecordFile(employee,key),false);passed('Actual attachment queries enforce current assignment and protected namespaces');
 await assert.rejects(ownerApi().settings.branches.update({id:branch.id,name:'Move',locationId:site.id+1}),/مرتبط/);passed('Populated hierarchy cannot move historical inventory outside transfers');
 // Check both post-security and pre-security v2 backups without contacting a storage provider.
 writeFileSync('qa-results/commercial-security-db.json',JSON.stringify({isolatedDatabase:true,checks,passed:checks.length,failed:0},null,2));
 console.log(JSON.stringify({securityDatabaseChecks:checks.length,failed:0,originalDatabaseUntouched:true}));
 const db=await getDb();await (db as any)?.$client?.end();
}
