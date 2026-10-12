import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
import mysql from 'mysql2/promise';
import {drizzle} from 'drizzle-orm/mysql2';
import {eq} from 'drizzle-orm';
import {locations} from '../drizzle/schema';
const state=vi.hoisted(()=>({db:null as any,content:''}));
vi.mock('./db',()=>({getDb:async()=>state.db}));
vi.mock('./storage',()=>({storagePut:async(_key:string,content:string)=>{state.content=content;return {url:'/qa/backup.tln'};}}));
import {backupRouter} from './routers/backup';
describe.skipIf(process.env.RUN_BACKUP_DB_TESTS!=='1')('Actual isolated backup roundtrip with database relations',()=>{
 let pool:mysql.Pool;
 const ctx=(role='owner')=>({user:{id:1,name:'QA owner',role},req:{ip:'127.0.0.1',headers:{}},res:{}}as any);
 beforeAll(()=>{
  if(!process.env.TEST_DATABASE_URL||process.env.TEST_DATABASE_URL===process.env.DATABASE_URL)throw new Error('A separate test database is required');
  pool=mysql.createPool({uri:process.env.TEST_DATABASE_URL,ssl:{minVersion:'TLSv1.2',rejectUnauthorized:true}});state.db=drizzle(pool);
 });
 afterAll(async()=>{await pool?.end();});
 it('denies backup and restore to administrator',async()=>{
  await expect(backupRouter.createCaller(ctx('admin')).create()).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(backupRouter.createCaller(ctx('admin')).restore({base64Data:'invalid'})).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it('exports all actual tables then restores original values transactionally',async()=>{
  const result=await state.db.insert(locations).values({name:'QA backup original',code:'QA-BACKUP',assetPrefix:'QAB',custodyPrefix:'QAC'});
  const id=Number(result[0].insertId),api=backupRouter.createCaller(ctx());
  await pool.query("UPDATE users SET sessionVersion='captured-before-backup' WHERE id=1");
  const backup=await api.create();expect(backup.tableCount).toBeGreaterThan(20);expect(state.content.length).toBeGreaterThan(0);
  await state.db.update(locations).set({name:'QA changed after backup'}).where(eq(locations.id,id));
  const restored=await api.restore({base64Data:Buffer.from(state.content,'utf8').toString('base64')});
  expect(restored.success).toBe(true);expect(restored.errors).toEqual([]);
  const [row]=await state.db.select().from(locations).where(eq(locations.id,id));expect(row.name).toBe('QA backup original');
  const [restoredUsers]:any=await pool.query('SELECT sessionVersion FROM users WHERE id=1');
  expect(restoredUsers[0].sessionVersion).toBeTruthy();expect(restoredUsers[0].sessionVersion).not.toBe('captured-before-backup');
 });
 it('restores pre-security v2 backups while generating new session authority',async()=>{
  const api=backupRouter.createCaller(ctx());await api.create();
  const backup=JSON.parse(Buffer.from(state.content,'base64').toString('utf8'));
  backup.schema.columns.users=backup.schema.columns.users.filter((column:any)=>!['sessionVersion','fieldHelpLoginCount'].includes(column.name));
  for(const user of backup.tables.users){delete user.sessionVersion;delete user.fieldHelpLoginCount;}
  const data=Buffer.from(Buffer.from(JSON.stringify(backup)).toString('base64')).toString('base64');
  expect((await api.restore({base64Data:data})).success).toBe(true);
  const [rows]:any=await pool.query('SELECT sessionVersion,fieldHelpLoginCount FROM users');expect(rows.every((user:any)=>Boolean(user.sessionVersion)&&user.fieldHelpLoginCount===0)).toBe(true);
 });
});
