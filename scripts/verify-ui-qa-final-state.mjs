// Read-only final reconciliation. Business records are created only through the UI.
import 'dotenv/config';
import mysql from 'mysql2/promise';
import {readFileSync,writeFileSync} from 'node:fs';
const root='qa-results/ui-full-cycle',checks=[],check=(name,pass)=>checks.push({name,pass:Boolean(pass)});
const read=f=>JSON.parse(readFileSync(`${root}/${f}`,'utf8'));
const ui=read('operational-import-negative-after-fix.json');
for(const c of ui.cases){
 check(`${c.case}: execution disabled`,c.executionDisabled===true);
 check(`${c.case}: zero accepted`,/المقبول\s+0/.test(c.text));
 check(`${c.case}: rejection explained`,c.case.includes('official')?c.text.includes('لا يمكن إعادة استيراد سجل يحمل رمزاً رسمياً'):c.text.includes('أسباب الرفض'));
}
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
let observed;
try{
 const [assets]=await db.query('SELECT status,COUNT(*) records,SUM(quantity) quantity,SUM(COALESCE(excludedQuantity,0)) excluded,SUM(warrantyReplacedQuantity) replaced FROM assets GROUP BY status');
 const [custody]=await db.query('SELECT status,COUNT(*) records,SUM(quantity) quantity,SUM(COALESCE(excludedQuantity,0)) excluded,SUM(warrantyReplacedQuantity) replaced FROM custody_items GROUP BY status');
 for(const [kind,rows] of [['assets',assets],['custody',custody]]){
  check(`${kind}: 101 records and no import duplicates`,rows.reduce((n,r)=>n+Number(r.records),0)===101);
  check(`${kind}: no draft introduced by rejected reimport`,!rows.some(r=>r.status==='DRAFT'));
 }
 const [reference]=await db.query('SELECT (SELECT COUNT(*) FROM financial_classifications) classifications,(SELECT COUNT(*) FROM locations) locations,(SELECT COUNT(*) FROM branches) branches,(SELECT COUNT(*) FROM departments) departments,(SELECT COUNT(*) FROM employees) employees,(SELECT COUNT(*) FROM users) users');
 for(const [key,count] of Object.entries({classifications:10,locations:7,branches:12,departments:6,employees:60,users:6}))check(`${key}: exact preserved count`,Number(reference[0][key])===count);
 const [periods]=await db.query("SELECT month,status,version,JSON_UNQUOTE(JSON_EXTRACT(snapshot,'$.total')) total FROM depreciation_periods ORDER BY month");
 check('Exactly 22 distinct monthly periods',periods.length===22&&new Set(periods.map(p=>p.month)).size===22);
 check('January closed, 20 historical months approved',periods[0].month==='2025-01'&&periods[0].status==='CLOSED'&&periods.slice(1,21).every(p=>p.status==='APPROVED'));
 check('October recalculated and pending, with identical independent total',periods.at(-1).month==='2026-10'&&periods.at(-1).status==='SUBMITTED'&&periods.at(-1).total==='117554.87');
 const [returnAudit]=await db.query("SELECT a.actionType,a.newData,u.username FROM audit_log a JOIN users u ON u.id=a.performedBy WHERE a.tableName='depreciation_periods' AND a.actionType='DEPRECIATION_RETURN'");
 check('October return kept manager and reason in audit',returnAudit.some(a=>a.username==='qa_finance_manager'&&JSON.stringify(a.newData).includes('QA-RETURN-202610')));
 const [movements]=await db.query('SELECT status,COUNT(*) records FROM depreciation_movements GROUP BY status');
 check('Nine approved movements and one deliberately invalid draft',movements.length===2&&movements.some(m=>m.status==='APPROVED'&&Number(m.records)===9)&&movements.some(m=>m.status==='DRAFT'&&Number(m.records)===1));
 const [journalCounts]=await db.query('SELECT kind,COUNT(*) records FROM depreciation_journals GROUP BY kind');
 const [invalidJournal]=await db.query("SELECT COUNT(*) records FROM depreciation_journals WHERE movementId=10 OR (kind='DEPRECIATION' AND periodId=(SELECT id FROM depreciation_periods WHERE month='2026-10'))");
 check('Invalid draft and open October have no posted journal',Number(invalidJournal[0].records)===0);
 const remainingOperationalUnits=[...assets,...custody].reduce((n,r)=>n+Number(r.quantity)-Number(r.excluded)-Number(r.replaced),0);
 check('700 initial units, 12 disposed, warranty replacements preserve 688 remaining',remainingOperationalUnits===688);
 observed={reference:reference[0],assets,custody,remainingOperationalUnits,periods,movements,journalCounts};
}finally{await db.end();}
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),sourceDatabaseModified:false,passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks,observed};
writeFileSync(`${root}/final-state-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
