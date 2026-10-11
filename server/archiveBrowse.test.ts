import {beforeEach,describe,it,expect,vi} from 'vitest';
import {transactionDatabase} from './test-utils/transactionDatabase';
import {generateArchiveReport} from '../client/src/lib/archiveReport';
const state=vi.hoisted(()=>({db:null as any}));vi.mock('./db',()=>({getDb:async()=>state.db}));
import {archiveRouter} from './archiveRouter';
const caller=()=>archiveRouter.createCaller({user:{id:2,role:'accounting_manager',name:'مدير'},req:{headers:{},ip:'127.0.0.1'},res:{}} as any);
beforeEach(()=>{state.db=transactionDatabase({archive_documents:Array.from({length:205},(_,i)=>({id:i+1,entityType:'asset',assetId:i+1,documentTitle:`Doc ${i+1}`,snapshot:{privateDetails:`Detail ${i+1}`}}))});});
describe('bounded archive browsing and historical detail',()=>{
 it('omits heavy snapshots and allows all documents to be reached through pagination',async()=>{
  const first=await caller().list({limit:100,offset:0}),second=await caller().list({limit:100,offset:100}),last=await caller().list({limit:100,offset:200});
  expect([first.length,second.length,last.length]).toEqual([100,100,5]);
  expect(new Set([...first,...second,...last].map(r=>r.id)).size).toBe(205);
  expect(first.every(r=>!('snapshot' in r))).toBe(true);
  expect((await caller().getById({id:205})).snapshot).toEqual({privateDetails:'Detail 205'});
 });
 it('rejects missing documents and unreasonable page sizes',async()=>{
  await expect(caller().getById({id:206})).rejects.toMatchObject({code:'NOT_FOUND'});
  await expect(caller().list({limit:1000})).rejects.toMatchObject({code:'BAD_REQUEST'});
 });
 it('prints only the requested entity details even from legacy full-period snapshots',()=>{
  const html=generateArchiveReport({id:1,entityType:'asset',assetId:7,documentTitle:'اعتماد إهلاك',createdAt:new Date(),snapshot:{newData:{snapshot:{from:'2026-05-01',to:'2026-05-31',currency:'SAR',lines:[{entityType:'asset',entityId:7,name:'أصل تاريخي',code:'A7',classification:'أثاث',unit:'<script>U7</script>',debit:'123.45'},{entityType:'custody',entityId:7,name:'عهدة أخرى',unit:'OTHER',debit:'900.00'}]}}}});
  expect(html).toContain('123.45');expect(html).toContain('2026-05-01');expect(html).toContain('&lt;script&gt;U7&lt;/script&gt;');expect(html).not.toContain('عهدة أخرى');expect(html).not.toContain('900.00');
 });
});
