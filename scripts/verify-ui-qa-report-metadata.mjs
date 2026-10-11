// Read-only proof that the smaller period projection preserves report inputs.
import 'dotenv/config';import mysql from 'mysql2/promise';import {writeFileSync} from 'node:fs';
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}}),checks=[];
const decode=v=>typeof v==='string'?JSON.parse(v):v;
try{
 const [full]=await db.query('SELECT month,status,snapshot FROM depreciation_periods ORDER BY month');
 const [small]=await db.query("SELECT month,status,JSON_OBJECT('total',JSON_EXTRACT(snapshot,'$.total'),'exceptions',JSON_EXTRACT(snapshot,'$.exceptions')) snapshot FROM depreciation_periods ORDER BY month");
 checks.push({key:'All periods remain represented',pass:full.length===small.length});
 for(let i=0;i<full.length;i++){
  const f=full[i],s=small[i],fp=decode(f.snapshot),sp=decode(s.snapshot);
  checks.push({key:`${f.month}: status/total/exceptions exact`,pass:s.month===f.month&&s.status===f.status&&sp.total===fp.total&&JSON.stringify(sp.exceptions)===JSON.stringify(fp.exceptions)});
 }
 const fullBytes=Buffer.byteLength(JSON.stringify(full)),metadataBytes=Buffer.byteLength(JSON.stringify(small));
 checks.push({key:'Repeated unit lines absent from report projection',pass:small.every(p=>!Object.hasOwn(decode(p.snapshot),'lines'))});
 const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,fullBytes,metadataBytes,reductionPercent:Number((100*(1-metadataBytes/fullBytes)).toFixed(2)),checks};
 writeFileSync('qa-results/ui-full-cycle/report-metadata-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
}finally{await db.end();}
