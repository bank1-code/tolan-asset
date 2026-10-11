import 'dotenv/config';
import mysql from 'mysql2/promise';
import {writeFileSync} from 'node:fs';
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
const decode=x=>typeof x==='string'?JSON.parse(x):x;
try {
 const [periods]=await db.query("SELECT id,snapshot,JSON_OBJECT('total',JSON_EXTRACT(snapshot,'$.total'),'currency',JSON_EXTRACT(snapshot,'$.currency'),'exceptionCount',COALESCE(JSON_LENGTH(JSON_EXTRACT(snapshot,'$.exceptions')),0)) AS summary FROM depreciation_periods");
 const [journals]=await db.query("SELECT id,snapshot,JSON_OBJECT('lines',JSON_EXTRACT(snapshot,'$.lines')) AS summary FROM depreciation_journals");
 const [exports]=await db.query('SELECT id,snapshot FROM depreciation_exports');
 const checks=[];const check=(name,ok)=>checks.push({name,passed:!!ok});
 for(const p of periods){const a=decode(p.snapshot),s=decode(p.summary);check(`Period ${p.id} totals/currency/exceptions unchanged`,a.total===s.total&&a.currency===s.currency&&(a.exceptions?.length??0)===s.exceptionCount);check(`Period ${p.id} full details excluded from initial load`,!('lines' in s));}
 for(const j of journals){const a=decode(j.snapshot),s=decode(j.summary);check(`Journal ${j.id} accounting lines unchanged`,JSON.stringify(a.lines)===JSON.stringify(s.lines));check(`Journal ${j.id} unit export details excluded from initial load`,Object.keys(s).join()==='lines');}
 const bytes=x=>Buffer.byteLength(JSON.stringify(x));
 const originalBytes=bytes([...periods.map(p=>decode(p.snapshot)),...journals.map(j=>decode(j.snapshot)),...exports.map(e=>decode(e.snapshot))]);
 const summaryBytes=bytes([...periods.map(p=>decode(p.summary)),...journals.map(j=>decode(j.summary))]);
 check('Immutable snapshots reduced by at least 80% in workspace',summaryBytes<originalBytes*.2);
 const failed=checks.filter(c=>!c.passed),result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS',checked:checks.length,failed,originalSnapshotBytes:originalBytes,workspaceSnapshotBytes:summaryBytes,reductionPercent:Math.round((1-summaryBytes/originalBytes)*10000)/100};
 writeFileSync('qa-results/ui-full-cycle/financial-workspace-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failed.length)process.exitCode=1;
} finally {await db.end();}
