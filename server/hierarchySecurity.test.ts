import { beforeEach, expect, it, vi } from 'vitest';
import { transactionDatabase } from './test-utils/transactionDatabase';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('./db',()=>({getDb:async()=>state.db}));
vi.mock('./security',()=>({logAuditAction:vi.fn()}));
import { settingsRouter } from './routers/settings';
const caller=()=>settingsRouter.createCaller({user:{id:1,role:'accountant'},req:{ip:'qa',headers:{}},res:{}}as any);
beforeEach(()=>{state.db=transactionDatabase({
 locations:[{id:1,code:'01',branchSequence:2},{id:2,code:'02',branchSequence:0}],
 branches:[{id:1,code:'01-01',sequenceNo:1,departmentSequence:1,locationId:1},{id:2,code:'02-01',sequenceNo:1,departmentSequence:0,locationId:2}],
 departments:[{id:1,name:'Existing',branchId:1,locationId:1,code:'01-01-01',sequenceNo:1,employeeSequence:0}],
 employees:[],assets:[{id:1,departmentId:1,locationId:1,status:'EXCLUDED'}],custody_items:[],audit_log:[]});state.db.execute=async()=>[[],[]];});
it('blocks department and branch relocation with historical records while preserving renaming',async()=>{
 await expect(caller().departments.update({id:1,name:'New',branchId:2})).rejects.toMatchObject({code:'CONFLICT'});
 await expect(caller().branches.update({id:1,name:'New',locationId:2})).rejects.toMatchObject({code:'CONFLICT'});
 expect(state.db.rows().assets[0].locationId).toBe(1);
 await expect(caller().departments.update({id:1,name:'Renamed',branchId:1})).resolves.toEqual({success:true});
 expect(state.db.rows().assets[0].locationId).toBe(1);
});
it('allows moving an empty department',async()=>{
 state.db.rows().assets.length=0;
 await expect(caller().departments.update({id:1,name:'Moved',branchId:2})).resolves.toEqual({success:true});
 expect(state.db.rows().departments[0].locationId).toBe(2);
});
