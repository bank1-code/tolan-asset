import 'dotenv/config';
import {readFileSync,writeFileSync} from 'node:fs';
import {appRouter} from '../server/routers';
import {getDb} from '../server/db';
const d=JSON.parse(readFileSync('qa-results/discovery.json','utf8'));
const owner=d.users.find((u:any)=>u.role==='owner');
const api=appRouter.createCaller({user:owner,req:{ip:'127.0.0.1',headers:{}},res:{}}as any);
try {
 const locations=await api.settings.locations.list();const site=locations.find(l=>l.id===270002);
 if(!site)throw new Error('Expected second location not found');
 // Explicit user approval: choose test prefixes/names, never relocate existing departments.
 if(!site.assetPrefix&&!site.custodyPrefix)await api.settings.locations.update({id:site.id,name:site.name,assetPrefix:'MA',custodyPrefix:'MC'});
 const branches=await api.settings.branches.list();let branch=branches.find(b=>b.locationId===site.id);
 if(!branch)branch=await api.settings.branches.create({name:'فرع الموقع الثاني للاختبار',locationId:site.id})as any;
 const departments=await api.settings.departments.list();let department=departments.find(x=>x.branchId===branch!.id);
 if(!department)department=await api.settings.departments.create({name:'قسم الموقع الثاني للاختبار',branchId:branch!.id})as any;
 const employees=await api.settings.employees.list();let employee=employees.find(x=>x.departmentId===department!.id);
 if(!employee){await api.settings.employees.create({fullName:'موظف الموقع الثاني للاختبار',departmentId:department!.id});employee=(await api.settings.employees.list()).find(x=>x.departmentId===department!.id);}
 writeFileSync('qa-results/repair-site.json',JSON.stringify({location:(await api.settings.locations.list()).find(x=>x.id===site.id),branchId:branch!.id,departmentId:department!.id,employeeId:employee!.id,existingAssignmentsMoved:false},null,2));
 console.log('PASS: configured second location without relocating existing records');
}finally{const db:any=await getDb();await db?.$client?.end();}
process.exit(0);
