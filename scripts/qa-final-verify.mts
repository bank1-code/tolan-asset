import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const run=JSON.parse(readFileSync('qa-results/run.json','utf8'));
const db=await mysql.createConnection({uri:process.env.DATABASE_URL!,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try {
 const [a]=await db.query('SELECT * FROM assets WHERE id IN (?) ORDER BY id',[run.original.assetIds]);
 const [c]=await db.query('SELECT * FROM custody_items WHERE id IN (?) ORDER BY id',[run.original.custodyIds]);
 assert.equal(hash(a),run.original.assetsHash);assert.equal(hash(c),run.original.custodyHash);
 const counts:any={};for(const table of ['assets','custody_items','depreciation_batches','depreciation_journals']){const [rows]:any=await db.query(`SELECT COUNT(*) AS n FROM ${table}`);counts[table]=rows[0].n;}
 const [policy]:any=await db.query('SELECT status FROM depreciation_policies WHERE id=?',[run.policyId]);
 const [batches]:any=await db.query('SELECT status,COUNT(*) AS n FROM depreciation_batches GROUP BY status');
 const result={verifiedAt:new Date().toISOString(),originalRecordsUnchanged:true,originalAssetCount:run.original.assetIds.length,originalCustodyCount:run.original.custodyIds.length,counts,qaPolicyStatus:policy[0]?.status,batchStatuses:batches};
 writeFileSync('qa-results/final-main-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 const discovery=JSON.parse(readFileSync('qa-results/discovery.json','utf8'));
 discovery.employees=discovery.employees.map(({id,fullName,departmentId,code}:any)=>({id,fullName,departmentId,code}));
 writeFileSync('qa-results/discovery.json',JSON.stringify(discovery,null,2));
}finally{await db.end();}
