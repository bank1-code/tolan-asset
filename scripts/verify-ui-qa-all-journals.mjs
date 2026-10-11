// Read-only check of every currently recorded journal, including retained reversals.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {writeFileSync} from 'node:fs';
const decode=v=>typeof v==='string'?JSON.parse(v):v;
const cents=v=>{
 const s=String(v);
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error('Invalid journal monetary precision');
 const [whole,fraction='']=s.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
const money=v=>`${v/100n}.${String(v%100n).padStart(2,'0')}`;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [rows]=await db.query('SELECT id,code,kind,effectiveDate,snapshot FROM depreciation_journals ORDER BY id');
 const observed=rows.map(r=>{
  const s=decode(r.snapshot),lines=s.lines;
  if(!Array.isArray(lines)||!lines.length)throw Error(`Empty journal ${r.code}`);
  const dr=lines.reduce((n,l)=>n+cents(l.debit),0n),cr=lines.reduce((n,l)=>n+cents(l.credit),0n);
  return {code:r.code,kind:r.kind,effectiveDate:r.effectiveDate,lineCount:lines.length,debit:money(dr),credit:money(cr),balanced:dr===cr,lineSidesValid:lines.every(l=>cents(l.debit)===0n||cents(l.credit)===0n)};
 });
 const failed=observed.filter(r=>!r.balanced||!r.lineSidesValid);
 const result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS',journalCount:rows.length,lineCount:observed.reduce((n,r)=>n+r.lineCount,0),uniqueCodes:new Set(rows.map(r=>r.code)).size===rows.length,unbalanced:failed.length,observed};
 if(!result.uniqueCodes)result.status='FAIL';
 writeFileSync('qa-results/ui-full-cycle/all-journals-balance-verification.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,observed:undefined,failed}));
 if(result.status!=='PASS')process.exitCode=1;
}finally{await db.end();}
