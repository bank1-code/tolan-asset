import {beforeEach,describe,expect,it,vi} from 'vitest';
import * as XLSX from 'xlsx';
import {transactionDatabase} from './test-utils/transactionDatabase';
import type {TrpcContext} from './_core/context';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('./db',()=>({getDb:async()=>state.db}));
vi.mock('./security',()=>({logAuditAction:vi.fn()}));
import {excelRouter} from './routers/excel';
const ctx={user:{id:1,name:'المحاسب',role:'accountant'},req:{ip:'127.0.0.1',headers:{}},res:{}} as TrpcContext;
const file=(kind:'asset'|'custody',code:string)=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
  [kind==='asset'?'اسم الأصل':'اسم العهدة','الرمز','الكمية','قيمة الوحدة','المستلم','القسم','الفرع','الموقع','رمز التصنيف','التصنيف المالي'],
  ['حاسب تجريبي',code,1,1200,'أحمد','تقنية المعلومات','الرئيسي','الرياض','ITC','الحواسيب'],
 ]),'بيانات');return XLSX.write(w,{type:'base64',bookType:'xlsx'}) as string;
};
beforeEach(()=>{state.db=transactionDatabase({
 employees:[{id:1,fullName:'أحمد'}],departments:[{id:1,name:'تقنية المعلومات',branchId:1}],branches:[{id:1,name:'الرئيسي',locationId:1}],locations:[{id:1,name:'الرياض'}],financial_classifications:[{id:1,active:true,code:'ITC',name:'الحواسيب'}],
 assets:[{id:1,assetCode:'AST-0001',assetName:'حاسب تجريبي',status:'EXCLUDED'}],custody_items:[{id:1,code:'CST-0001',name:'حاسب تجريبي',status:'REPLACED'}],audit_log:[],
 });});
describe('Official identity in operational Excel import',()=>{
 for(const kind of ['asset','custody'] as const){
  for(const previewOnly of [true,false])it(`${kind} rejects exported identities during ${previewOnly?'preview':'execution'} without duplicating or reopening historical records`,async()=>{
   const before=structuredClone(state.db.rows()),caller=excelRouter.createCaller(ctx),input={base64Data:file(kind,kind==='asset'?'AST-0001':'CST-0001'),previewOnly};
   const result=kind==='asset'?await caller.importAssets(input):await caller.importCustody(input);
   expect(result).toMatchObject({imported:0,skipped:1,total:1});expect(result.errors[0]).toContain('رمزاً رسمياً');expect(state.db.rows()).toEqual(before);
  });
  it(`${kind} accepts a new template without a requested official identity during preview`,async()=>{
   const before=structuredClone(state.db.rows()),caller=excelRouter.createCaller(ctx),input={base64Data:file(kind,''),previewOnly:true};
   const result=kind==='asset'?await caller.importAssets(input):await caller.importCustody(input);
   expect(result).toMatchObject({imported:1,skipped:0,total:1,errors:[]});expect(state.db.rows()).toEqual(before);
  });
 }
});
