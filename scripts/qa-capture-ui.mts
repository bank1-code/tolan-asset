import "dotenv/config";
import {existsSync,readFileSync,writeFileSync} from "node:fs";
import mysql from "mysql2/promise";
const expires=Date.now()+600000;
let snapshot:any;
while(Date.now()<expires){const report=JSON.parse(readFileSync("qa-results/financial.json","utf8"));if(report.isolatedDatabaseRemoved||report.fatal)throw new Error("Isolated financial database no longer available");if(report.monthly.length>=9&&existsSync("qa-results/financial-report.json")){snapshot=report;break;}await new Promise(resolve=>setTimeout(resolve,2000));}
if(!snapshot)throw new Error("Financial QA snapshot not ready before deadline");
if(!/^tolan_qa_\d+_[a-f0-9]{8}$/.test(snapshot.schema))throw new Error("Invalid isolated schema");
const url=new URL(process.env.DATABASE_URL!);url.pathname=`/${snapshot.schema}`;
const connection=await mysql.createConnection({uri:url.toString(),ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
try{const [tables]=await connection.query<any[]>("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");const database:any={};for(const row of tables){const name=String(Object.values(row)[0]);if(!/^[a-zA-Z0-9_]+$/.test(name))throw new Error("Invalid table name");const [rows]=await connection.query<any[]>(`SELECT * FROM \`${name}\``);database[name]=name==="users"?rows.map(({id,name,role,employeeId})=>({id,name,role,employeeId})):rows;}writeFileSync("qa-results/ui-database.json",JSON.stringify(database,null,2));console.log("PASS: read-only UI fixture captured from isolated validated QA database; user secrets omitted.");}finally{await connection.end();}
