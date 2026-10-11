import 'dotenv/config';
import mysql from 'mysql2/promise';
import {writeFileSync} from 'node:fs';
const db=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});
try{
 const [counts]=await db.query("SELECT operationType,COUNT(*) AS documents FROM archive_documents GROUP BY operationType");
 const [rows]=await db.query("SELECT id,operationType,OCTET_LENGTH(snapshot) AS snapshotBytes FROM archive_documents ORDER BY id DESC LIMIT 5");
 const result={checkedAt:new Date().toISOString(),sourceDatabaseModified:false,counts,sampledLatestDocuments:rows,note:'Initial unrestricted JSON-size aggregate exceeded database query memory quota; replaced with bounded sample. No settings were weakened.'};
 writeFileSync('qa-results/ui-full-cycle/archive-size-observed.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await db.end();}
