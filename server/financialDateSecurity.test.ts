import { expect, it } from 'vitest';
import { assertFutureDate } from './depreciationStore';
import { transactionDatabase } from './test-utils/transactionDatabase';
it('blocks financial changes preceding the first approved period and permits future dates',async()=>{
 const db=transactionDatabase({depreciation_periods:[{id:1,month:'2026-05',status:'APPROVED'},{id:2,month:'2026-06',status:'CLOSED'},{id:3,month:'2026-09',status:'DRAFT'}]});
 for(const date of ['2025-12-01','2026-05-01','2026-06-30'])await expect(assertFutureDate(db,date)).rejects.toThrow('فترة محتسبة');
 await expect(assertFutureDate(db,'2026-07-01')).resolves.toBeUndefined();
});
