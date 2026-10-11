import {describe,it,expect} from 'vitest';
import {transactionDatabase} from './test-utils/transactionDatabase';
import {financialAudit} from './depreciationStore';
import {archiveEvents} from './history';
const ctx={user:{id:2,name:'مدير الحسابات'},req:{ip:'127.0.0.1',headers:{}}};
const line=(entityType:string,entityId:number,unit:string,debit:string)=>({entityType,entityId,unit,debit,name:`سجل ${entityId}`});
describe('financial period archive scalability and integrity',()=>{
 it('keeps the full audit once and independent entity details in each archive',async()=>{
  const db=transactionDatabase({audit_log:[],archive_documents:[]});
  const snapshot={from:'2026-09-01',to:'2026-09-30',currency:'SAR',total:'6.00',lines:[line('asset',1,'A1','1.00'),line('asset',1,'A2','2.00'),line('custody',1,'C1','3.00')],exceptions:[]};
  const old={id:8,status:'SUBMITTED',snapshot:JSON.stringify(snapshot)};
  const next={code:'DEP-1',snapshot};
  await db.transaction((tx:any)=>financialAudit(tx,ctx,'depreciation_periods',8,'DEPRECIATION_APPROVE',old,next));
  const rows=db.rows();
  expect(rows.audit_log[0].oldData).toEqual(old);
  expect(rows.audit_log[0].newData).toEqual(next);
  expect(rows.archive_documents).toHaveLength(2);
  for(const doc of rows.archive_documents){const scope=doc.snapshot.entityType;const data=doc.snapshot.newData;expect(data.snapshot.lines.every((l:any)=>l.entityType===scope&&l.entityId===1)).toBe(true);expect(data.snapshot.total).toBe('3.00');expect(data.archiveScope).toMatchObject({recordId:8,fullAuditId:rows.audit_log[0].id,periodTotal:'6.00'});expect(doc.snapshot.oldData.snapshot.lines).toEqual(data.snapshot.lines);}
  expect(new Set(rows.archive_documents.map((r:any)=>r.sourceKey)).size).toBe(2);
  expect(snapshot.lines).toHaveLength(3);
 });
 it('rolls back the full audit when any archive chunk fails',async()=>{
  const db=transactionDatabase({audit_log:[],archive_documents:[]});db.failOn('archive_documents',2);
  const lines=Array.from({length:101},(_,i)=>line('asset',i+1,`U${i}`,'1.00'));
  await expect(db.transaction((tx:any)=>financialAudit(tx,ctx,'depreciation_periods',9,'DEPRECIATION_APPROVE',null,{snapshot:{total:'101.00',lines,exceptions:[]}}))).rejects.toThrow('Injected');
  expect(db.rows().audit_log).toEqual([]);expect(db.rows().archive_documents).toEqual([]);
 });
 it('batches documents without merging identities or altering history',async()=>{
  const writes:any[]=[];const tx={insert:()=>({values:async(rows:any[])=>writes.push(rows)})};
  const events=Array.from({length:120},(_,i)=>({entityType:'asset' as const,entityId:i+1,eventType:'DEPRECIATION_APPROVE',sourceKey:`period:1:${i}`,newData:{name:`A${i}`}}));
  await archiveEvents(tx,ctx,events);
  expect(writes.map(r=>r.length)).toEqual([50,50,20]);expect(writes.flat()).toHaveLength(120);expect(new Set(writes.flat().map(r=>r.sourceKey)).size).toBe(120);
 });
 it('limits bulk request bytes for larger documents',async()=>{
  const writes:any[]=[];const tx={insert:()=>({values:async(rows:any[])=>writes.push(rows)})};
  await archiveEvents(tx,ctx,Array.from({length:5},(_,i)=>({entityType:'custody' as const,entityId:i+1,eventType:'TEST',sourceKey:`size:${i}`,newData:{name:'x'.repeat(300_000)}})));
  expect(writes.length).toBeGreaterThan(1);
  expect(writes.flat()).toHaveLength(5);
  expect(writes.every(rows=>rows.reduce((bytes:number,row:any)=>bytes+Buffer.byteLength(JSON.stringify(row),'utf8'),0)<=1_000_000)).toBe(true);
 });
});
