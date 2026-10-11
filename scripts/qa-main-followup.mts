import "dotenv/config";
import {readFileSync,writeFileSync} from "node:fs";
import mysql from "mysql2/promise";
import {strict as assert} from "node:assert";
import {createHash} from "node:crypto";
import {appRouter} from "../server/routers";
import {getDb} from "../server/db";
const run=JSON.parse(readFileSync("qa-results/run.json","utf8")),discovery=JSON.parse(readFileSync("qa-results/discovery.json","utf8"));
const connection=await mysql.createConnection({uri:process.env.DATABASE_URL!,ssl:{minVersion:"TLSv1.2",rejectUnauthorized:true}}),hash=(v:any)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const make=(id:number)=>appRouter.createCaller({user:discovery.users.find((u:any)=>u.id===id),req:{ip:"127.0.0.1",headers:{}},res:{}}as any),maker=make(run.actors.maker.id),reviewer=make(run.actors.reviewer.id);
try{
 const session=await maker.inventoryCount.getSession({id:run.inventorySessionId});assert.equal(session.status,"DRAFT");
 const items=(session.items as any[]).map((item,index)=>({id:item.id,entityType:item.entityType,actualQuantity:index===0?Math.max(0,item.expectedQuantity-1):index===1?item.expectedQuantity+1:index===2?item.expectedQuantity:null,reason:index<2?`${run.marker} فرق اصطناعي للاختبار`:""}));
 const before=hash((await connection.query("SELECT * FROM assets ORDER BY id"))[0]);
 const first=await maker.inventoryCount.saveDraft({id:session.id,expectedVersion:session.version,items}),second=await maker.inventoryCount.saveDraft({id:session.id,expectedVersion:first.version,items});
 const submitted=await maker.inventoryCount.submitSession({id:session.id,expectedVersion:second.version});await reviewer.inventoryCount.approveSession({id:session.id,expectedVersion:submitted.version});
 const [differences]=await connection.query<any[]>("SELECT * FROM inventory_differences WHERE sessionId=?",[session.id]);assert.equal(differences.length,2);assert.equal(hash((await connection.query("SELECT * FROM assets ORDER BY id"))[0]),before);
 const saved=await maker.inventoryCount.getSession({id:session.id});assert.equal((saved.scope as any).submissionSummary.submittedCount,3);assert.equal((saved.items as any[]).length,3);
 const old=run.checks.find((c:any)=>c.name.startsWith("حفظ الجرد مرتين"));old.status="INVALID_TEST";old.reason="طلب الاختبار أرسل جزءاً من لقطة الحفظ؛ عقد API يتطلب اللقطة كاملة مع الكميات غير المفحوصة null. أُعيد الاختبار بالطلب الصحيح.";
 run.checks.push({name:"الجرد باللقطة الصحيحة: حفظان ثم إرسال 3 مفحوصات فقط واعتماد فرقين دون تغيير الكمية",status:"PASS",evidence:{sessionId:session.id,scopeCount:items.length,submittedCount:3,visibleApprovedItems:3,differences:2,originalQuantityUnchanged:true}});
 run.inventoryDifferences=differences.map((d:any)=>({id:d.id,entityType:d.entityType,entityId:d.entityId,difference:d.difference,status:d.status}));
 const originalAssetIds=run.original.assetIds.join(","),originalCustodyIds=run.original.custodyIds.join(",");const [originalAssets]=await connection.query(`SELECT * FROM assets WHERE id IN (${originalAssetIds}) ORDER BY id`),[originalCustody]=await connection.query(`SELECT * FROM custody_items WHERE id IN (${originalCustodyIds}) ORDER BY id`);assert.equal(hash(originalAssets),run.original.assetsHash);assert.equal(hash(originalCustody),run.original.custodyHash);
 writeFileSync("qa-results/run.json",JSON.stringify(run,null,2));
 console.log("PASS: two saves, three submitted items, two differences, unchanged operational quantities and original records.");
}catch(error:any){run.checks.push({name:"إعادة اختبار الجرد باللقطة الصحيحة",status:"FAIL",error:error.message});writeFileSync("qa-results/run.json",JSON.stringify(run,null,2));console.error(error.message);process.exitCode=1;}
finally{await connection.end();const db:any=await getDb();await db?.$client?.end();}
process.exit(process.exitCode??0);
