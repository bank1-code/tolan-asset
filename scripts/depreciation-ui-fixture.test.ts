import {it,vi} from "vitest";
import express from "express";
import path from "node:path";
import {createExpressMiddleware} from "@trpc/server/adapters/express";
import {transactionDatabase} from "../server/test-utils/transactionDatabase";
const fixture=vi.hoisted(()=>({db:null as any}));
vi.mock("../server/db",()=>({getDb:async()=>fixture.db}));
vi.mock("../server/security",()=>({logAuditAction:vi.fn()}));
import {appRouter} from "../server/routers";
it.skipIf(process.env.RUN_DEPRECIATION_UI_FIXTURE!=="1")("isolated depreciation browser fixture",async()=>{
 const setup={organizationName:"مؤسسة الاختبار المعزول",currency:"SAR",fiscalStartMonth:1,openingDate:"2026-05-01",capitalizationThreshold:"0",partialMonth:"ACTUAL_DAYS",rules:[{classificationId:1,treatment:"DEPRECIABLE",lifeMonths:60,residualPercent:"0",expenseName:"مصروف إهلاك الأثاث",accumulatedName:"مجمع إهلاك الأثاث",costName:"الأثاث"}]};
 const profile={label:"أثاث الرياض",quantity:2,unitCost:"6000",unitResidual:"0",openingAccumulated:"0",openingImpairment:"0",recognitionDate:"2026-05-01",availableForUseDate:"2026-05-01",balanceDate:"2026-05-01",lifeMonths:60,documentReference:"INV-1",allocation:{costCenter:"CC-01",location:"الرياض",branch:"الرئيسي",department:"المالية"},units:["F-01","F-02"],notes:"بيانات محاكاة"};
 fixture.db=transactionDatabase({app_settings:[{id:1,systemName:"اختبار وحدة الإهلاك المعزول",systemSubtitle:"محاكاة في الذاكرة"}],depreciation_control:[{id:1,revision:0}],financial_classifications:[{id:1,code:"FURN",name:"أثاث وتركيبات",active:true}],depreciation_policies:[{id:1,status:"APPROVED",version:2,createdBy:2,updatedBy:2,approvedBy:3,effectiveDate:"2026-05-01",payload:setup}],depreciation_batches:[{id:1,entityType:"asset",entityId:1,classificationId:1,policyId:1,status:"APPROVED",version:2,createdBy:2,updatedBy:2,approvedBy:3,payload:profile}],depreciation_movements:[],depreciation_periods:[],depreciation_journals:[],depreciation_exports:[],assets:[{id:1,assetName:"مكاتب إدارية",assetCode:"A-001",quantity:2,status:"ACTIVE",classificationId:1,approvedAt:new Date("2026-05-01"),excludedQuantity:0,warrantyReplacedQuantity:0}],custody_items:[],asset_exclusions:[],asset_transfers:[],warranty_replacements:[],audit_log:[],archive_documents:[],locations:[],departments:[],branches:[],employees:[],inventory_sessions:[],users:[]});
 const base={req:{ip:"127.0.0.1",headers:{}},res:{}};
 const accountant=appRouter.createCaller({...base,user:{id:2,role:"accountant",name:"محاسب الاختبار"}as any});
 const manager=appRouter.createCaller({...base,user:{id:3,role:"accounting_manager",name:"مدير حسابات الاختبار"}as any});
 const draft=await accountant.depreciation.savePeriod({month:"2026-05"});await accountant.depreciation.submitPeriod({id:draft.id,expectedVersion:0});await manager.depreciation.approvePeriod({id:draft.id,expectedVersion:1});
 fixture.db.execute=async()=>[[],[]];const app=express();app.use(express.json({limit:"50mb"}));let finish!:()=>void;const done=new Promise<void>(resolve=>finish=resolve);
 app.get("/__fixture/role/:role",(req,res)=>{res.cookie("fixture_role",req.params.role==="accounting_manager"?"accounting_manager":"accountant");res.redirect("/depreciation");});
 app.post("/__fixture/stop",(_,res)=>{res.json({stopped:true});finish();});
 app.use("/api/trpc",createExpressMiddleware({router:appRouter,createContext:({req,res})=>{const manager=/fixture_role=accounting_manager/.test(req.headers.cookie??"");return{req,res,user:{id:manager?3:2,role:manager?"accounting_manager":"accountant",name:manager?"مدير حسابات الاختبار":"محاسب الاختبار",username:manager?"test_manager":"test_accountant"}as any};}}));
 app.use(express.static(path.resolve("dist/public")));app.get("*",(_,res)=>res.sendFile(path.resolve("dist/public/index.html")));
 const server=app.listen(3218,"127.0.0.1",()=>console.log("Isolated depreciation UI: http://127.0.0.1:3218/depreciation"));try{await done;}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
},600000);
