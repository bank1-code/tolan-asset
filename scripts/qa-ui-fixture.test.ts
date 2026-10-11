import {it,vi} from "vitest";
import express from "express";
import path from "node:path";
import {readFileSync} from "node:fs";
import {createExpressMiddleware} from "@trpc/server/adapters/express";
import {transactionDatabase} from "../server/test-utils/transactionDatabase";
const data=vi.hoisted(()=>({db:null as any}));vi.mock("../server/db",()=>({getDb:async()=>data.db}));vi.mock("../server/security",()=>({logAuditAction:vi.fn()}));
import {appRouter} from "../server/routers";
it.skipIf(process.env.RUN_QA_UI!=="1")("QA UI snapshot in memory; never writes project database",async()=>{
 const snapshot=JSON.parse(readFileSync("qa-results/ui-database.json","utf8"));data.db=transactionDatabase(snapshot);data.db.execute=async()=>[[],[]];
 const app=express();app.use(express.json({limit:"20mb"}));let finish!:()=>void;const done=new Promise<void>(resolve=>finish=resolve);
 app.post("/__qa/stop",(_,res)=>{res.json({stopped:true});finish();});
 app.use("/api/trpc",createExpressMiddleware({router:appRouter,createContext:({req,res})=>({req,res,user:{id:900000001,role:"accounting_manager",name:"مدير حسابات اختبار QA",username:"qa-memory"}as any})}));
 app.use(express.static(path.resolve("dist/public")));app.get("*",(_,res)=>res.sendFile(path.resolve("dist/public/index.html")));
 const server=app.listen(3218,"127.0.0.1",()=>console.log("QA UI fixture (memory only): http://127.0.0.1:3218/depreciation"));try{await done;}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},600000);
