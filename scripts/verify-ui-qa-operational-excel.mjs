// Read-only database reconciliation of actual UI downloads.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
const root='qa-results/ui-full-cycle',checks=[];
const check=(key,pass)=>checks.push({key,pass});
const connection=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 for(const kind of ['assets','custody']){
  const w=XLSX.read(readFileSync(`${root}/${kind}-ui-final-export.xlsx`),{type:'buffer'});
  const data=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,defval:''});
  const template=XLSX.read(readFileSync(`${root}/${kind}-ui-final-template.xlsx`),{type:'buffer'});
  const header=XLSX.utils.sheet_to_json(template.Sheets[template.SheetNames[0]],{header:1})[0];
  const col=label=>data[0].indexOf(label);
  check(`${kind}: classification template columns`,header.includes('رمز التصنيف')&&header.includes('التصنيف المالي'));
  check(`${kind}: server generates code, no template code`,!header.includes('الرمز'));
  const table=kind==='assets'?'assets':'custody_items',code=kind==='assets'?'assetCode':'code',name=kind==='assets'?'assetName':'name';
  const [current]=await connection.query(`SELECT t.${code} code,t.${name} name,t.quantity,t.assetValue,t.condition,t.status,t.notes,c.code classificationCode,c.name classificationName,e.fullName employeeName,d.name departmentName,b.name branchName,l.name locationName FROM ${table} t LEFT JOIN financial_classifications c ON c.id=t.classificationId LEFT JOIN employees e ON e.id=t.assignedTo LEFT JOIN departments d ON d.id=t.departmentId LEFT JOIN branches b ON b.id=d.branchId LEFT JOIN locations l ON l.id=t.locationId ORDER BY t.id`);
  check(`${kind}: all 101 current records`,current.length===101&&data.length===102);
  for(const r of current){
   const exported=data.slice(1).filter(row=>row[col('الرمز')]===r.code);
   check(`${kind}/${r.code}: unique exported row`,exported.length===1);if(exported.length!==1)continue;
   const row=exported[0];
   check(`${kind}/${r.code}: data and classification`,row[0]===r.name&&row[col('رمز التصنيف')]===r.classificationCode&&row[col('التصنيف المالي')]===r.classificationName&&row[col('الكمية')]===r.quantity&&Number(row[col('قيمة الوحدة')])===Number(r.assetValue));
   check(`${kind}/${r.code}: current allocation`,[['المستلم','employeeName'],['القسم','departmentName'],['الفرع','branchName'],['الموقع','locationName']].every(([label,field])=>row[col(label)]===(r[field]||'')));
  }
 }
}finally{await connection.end();}
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,source:'Files downloaded through application UI',passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks};
writeFileSync(`${root}/operational-excel-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
