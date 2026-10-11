import 'dotenv/config';import mysql from 'mysql2/promise';import {writeFileSync} from 'node:fs';
const decode=x=>typeof x==='string'?JSON.parse(x):x;
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,dateStrings:true,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const[[column]]=await db.query("SELECT COLUMN_TYPE AS type FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='audit_log' AND column_name='actionType'");
 const[[difference]]=await db.query('SELECT * FROM inventory_differences WHERE entityType=? AND entityId=?',['custody',390057]);
 const[actions]=await db.query('SELECT a.*,u.username FROM inventory_difference_actions a JOIN users u ON u.id=a.performedBy WHERE differenceId=? ORDER BY a.id',[difference.id]);
 const[audits]=await db.query("SELECT * FROM audit_log WHERE tableName='inventory_differences' AND recordId=? AND actionType IN ('INVENTORY_REVIEW','INVENTORY_DIFFERENCE_REVIEW') ORDER BY id",[difference.id]);
 const[[entity]]=await db.query('SELECT quantity,assetValue,excludedQuantity,warrantyReplacedQuantity FROM custody_items WHERE id=?',[390057]);
 const[[batch]]=await db.query('SELECT payload FROM depreciation_batches WHERE entityType=? AND entityId=?',['custody',390057]);
 const checks=[],check=(name,ok)=>checks.push({name,passed:!!ok});
 check('Existing audit storage contract unchanged',column.type==='varchar(20)');
 check('Original counted 9 against 10 and reason retained',difference.expectedQuantity===10&&difference.actualQuantity===9&&difference.difference===-1&&difference.reason.startsWith('QA: وحدة واحدة'));
 const p=decode(batch.payload);check('Operational and financial quantities and cost unchanged',entity.quantity===10&&entity.excludedQuantity===0&&entity.warrantyReplacedQuantity===0&&p.quantity===10&&p.unitCost===entity.assetValue);
 if(process.argv.includes('--before-fix')){check('Failed UI save rolled back difference action and audit together',actions.length===0&&audits.length===0);}
 else{
  check('Start, documented review and reopening all retained',actions.length===3&&actions.map(a=>a.actionType).join(',')==='START,REVIEW,REOPEN');
  check('Review processes one and reopen reverses one',actions.map(a=>a.quantity).join(',')==='0,1,-1');
  check('Every action by accounting manager with reason and time',actions.every(a=>a.username==='qa_finance_manager'&&a.performedByName==='مدير الحسابات'&&a.note.startsWith('QA-DIFF-')&&!!a.createdAt));
  check('Documented closure retains one inventory PDF',actions[1]&&decode(actions[1].evidence).documents.length===1&&decode(actions[1].evidence).documents[0].name==='qa-inventory-review.pdf'&&decode(actions[1].evidence).documents[0].url.startsWith('/api/files/documents/inventory/'));
  check('Exactly one fitting transactional audit per action',audits.length===actions.length&&audits.every((a,i)=>a.actionType==='INVENTORY_REVIEW'&&a.performedBy===actions[i].performedBy&&decode(a.newData).actionType===actions[i].actionType));
  check('Difference reopened fully without replacing previous evidence',actions.reduce((n,a)=>n+a.quantity,0)===0);
 }
 const failed=checks.filter(c=>!c.passed),r={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,status:failed.length?'FAIL':'PASS_OBSERVED',checked:checks.length,checks,failed,actionCount:actions.length,auditCount:audits.length};
 writeFileSync(`qa-results/ui-full-cycle/difference-actions-${process.argv.includes('--before-fix')?'rollback':'verification'}.json`,JSON.stringify(r,null,2));console.log(JSON.stringify(r));if(failed.length)process.exitCode=1;
}finally{await db.end();}
