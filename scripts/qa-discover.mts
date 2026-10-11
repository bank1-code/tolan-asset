import "dotenv/config";
import mysql from "mysql2/promise";
import {writeFileSync,mkdirSync} from "node:fs";
const connection=await mysql.createConnection({uri:process.env.DATABASE_URL!,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
try{
 const result:any={};
 for(const table of ["locations","branches","departments","employees","users","financial_classifications","depreciation_policies","depreciation_periods","exclusion_types"]){
  const [rows]=await connection.query(`SELECT * FROM \`${table}\``);
  result[table]=table==="users"?(rows as any[]).map(({id,name,role,employeeId})=>({id,name,role,employeeId})):rows;
 }
 result.counts={};for(const table of ["assets","custody_items","asset_exclusions","asset_transfers","warranty_replacements","inventory_sessions","audit_log","archive_documents","depreciation_batches","depreciation_journals"]){const [rows]=await connection.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);result.counts[table]=rows[0].n;}
 mkdirSync("qa-results",{recursive:true});writeFileSync("qa-results/discovery.json",JSON.stringify(result,null,2));
 console.log(JSON.stringify({counts:result.counts,hierarchy:Object.fromEntries(["locations","branches","departments","employees"].map(t=>[t,result[t].length])),roles:result.users.map((u:any)=>({id:u.id,role:u.role})),classes:result.financial_classifications,policies:result.depreciation_policies.map((p:any)=>({id:p.id,status:p.status,effectiveDate:p.effectiveDate})),exclusionTypes:result.exclusion_types},null,2));
}finally{await connection.end();}
