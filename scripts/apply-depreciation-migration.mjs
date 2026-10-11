import "dotenv/config";
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}});
try {
 const existing=["assets","custody_items","asset_exclusions","asset_transfers","warranty_replacements","audit_log","archive_documents","inventory_sessions"];
 const counts=async()=>{const result={};for(const table of existing){const[rows]=await db.query(`SELECT COUNT(*) count FROM \`${table}\``);result[table]=Number(rows[0].count);}return result;};
 const before=await counts();
 if(!process.argv.includes("--check")){
  const sql=readFileSync(new URL("../drizzle/0019_dark_stingray.sql",import.meta.url),"utf8");
  for(const statement of sql.split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean)) {
   const column=statement.match(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/),constraint=statement.match(/ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)`/);
   if(column){const[rows]=await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?",column.slice(1));if(rows.length)continue;}
   if(constraint){const[rows]=await db.query("SELECT 1 FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND table_name=? AND constraint_name=?",constraint.slice(1));if(rows.length)continue;}
   await db.query(statement.replace(/CREATE TABLE `([^`]+)`/,"CREATE TABLE IF NOT EXISTS `$1`"));
  }
 }
 const tables=["financial_classifications","depreciation_control","depreciation_policies","depreciation_batches","depreciation_movements","depreciation_periods","depreciation_journals","depreciation_exports"];
 const[found]=await db.query("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?)",[tables]);
 if(found.length!==8)throw new Error("Financial tables incomplete");
 const[columns]=await db.query("SELECT TABLE_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND column_name='classificationId' AND table_name IN ('assets','custody_items')");if(columns.length!==2)throw new Error("Classification links incomplete");
 const[unique]=await db.query("SELECT CONSTRAINT_NAME FROM information_schema.table_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('depreciation_journals_code_unique','depreciation_journals_sourceKey_unique','depreciation_periods_month_unique','financial_classifications_code_unique')");if(unique.length!==4)throw new Error("Unique constraints incomplete");
 const[mutex]=await db.query("SELECT id FROM depreciation_control WHERE id=1");if(mutex.length!==1)throw new Error("Financial transaction mutex missing");
 const after=await counts();if(JSON.stringify(before)!==JSON.stringify(after))throw new Error("Existing record counts changed; inspect concurrent activity.");
 console.log("Depreciation schema verified. Existing records preserved:",JSON.stringify(after));
}finally{await db.end();}
