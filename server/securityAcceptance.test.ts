import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import express from 'express';
import type {Server} from 'node:http';
import {canonicalFileKey,mayDownloadFile} from './fileAccess';
import {takeLoginAttempt,clearLoginAttempts} from './loginAttempts';
import {readExcelRows} from './excelInput';
import * as XLSX from 'xlsx';
const state=vi.hoisted(()=>({user:null as any,put:vi.fn(async()=>({url:'/api/files/documents/archive/test.pdf'})),get:vi.fn(async()=>({url:'https://storage.example/authorized'}))}));
vi.mock('./_core/sdk',()=>({sdk:{authenticateRequest:vi.fn(async()=>{if(!state.user)throw new Error('No session');return state.user;})}}));
vi.mock('./storage',()=>({storagePut:state.put,storageGet:state.get}));
import {fileDownloadRouter} from './fileDownload';
import {fileUploadRouter} from './fileUpload';
let server:Server,base:string;
beforeEach(async()=>{state.user=null;state.put.mockClear();state.get.mockClear();const app=express();app.use(fileDownloadRouter);app.use(fileUploadRouter);server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${(server.address()as any).port}`;});
afterEach(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
describe('file authorization and upload parsing boundaries',()=>{
 it('denies discovered backup keys for every non-owner including encoded namespace',async()=>{
  for(const role of ['admin','accounting_manager','accountant','employee'])for(const path of ['/api/files/backups/backup.tln','/api/files/%62ackups/backup.tln']){state.user={role};expect((await fetch(base+path,{redirect:'manual'})).status).toBe(404);}
  expect(state.get).not.toHaveBeenCalled();state.user={role:'owner'};expect((await fetch(base+'/api/files/backups/backup.tln',{redirect:'manual'})).status).toBe(302);expect(state.get).toHaveBeenCalledWith('backups/backup.tln');
 });
 it('rejects separator aliases double encoding and traversal before signing',()=>{
  for(const path of ['/api/files/backups%2Fbackup.tln','/api/files/%2562ackups/backup.tln','/api/files//backups/a','/api/files/a/%2e%2e/b','/api/files/a%5Cb','/api/files/a/%00'])expect(()=>canonicalFileKey(path)).toThrow();
  expect(mayDownloadFile('accountant',canonicalFileKey('/api/files/images/asset/a.webp'))).toBe(true);
 });
 it('keeps ordinary authenticated document downloads',async()=>{state.user={role:'accountant'};expect((await fetch(base+'/api/files/documents/archive/a.pdf',{redirect:'manual'})).status).toBe(302);expect(state.get).toHaveBeenCalledWith('documents/archive/a.pdf');});
 it('rejects an unauthorized malformed body before multipart parser runs',async()=>{
  const request={method:'POST',headers:{'content-type':'multipart/form-data'},body:'not multipart'};
  expect((await fetch(base+'/api/upload',request)).status).toBe(401);state.user={role:'employee'};expect((await fetch(base+'/api/upload',request)).status).toBe(403);expect(state.put).not.toHaveBeenCalled();
 });
 it('accepts an operator file but refuses extra fields and multiple files',async()=>{
  state.user={role:'accountant'};const file=()=>new Blob(['%PDF-1.4\nfixture'],{type:'application/pdf'});
  const normal=new FormData();normal.append('file',file(),'test.pdf');expect((await fetch(base+'/api/upload',{method:'POST',body:normal})).status).toBe(200);expect(state.put).toHaveBeenCalledTimes(1);
  const fields=new FormData();fields.append('note','forbidden');fields.append('file',file(),'test.pdf');expect((await fetch(base+'/api/upload',{method:'POST',body:fields})).status).toBe(400);
  const files=new FormData();files.append('file',file(),'a.pdf');files.append('file',file(),'b.pdf');expect((await fetch(base+'/api/upload',{method:'POST',body:files})).status).toBe(400);expect(state.put).toHaveBeenCalledTimes(1);
 });
});
describe('per invocation login budget',()=>{
 it('blocks attempts across equivalent username spellings and resets only successful identity',()=>{
  const ip='test-budget',account='test-budget-user';clearLoginAttempts(ip,account);
  for(let i=0;i<10;i++)takeLoginAttempt(ip,i%2?account.toUpperCase():account,1000);
  expect(()=>takeLoginAttempt(ip,account,1001)).toThrow();expect(()=>takeLoginAttempt('other-ip',account,1001)).toThrow();
  clearLoginAttempts(ip,account);expect(()=>takeLoginAttempt(ip,account,1002)).not.toThrow();
 });
});
describe('bounded isolated Excel parsing',()=>{
 const file=(ref?:string)=>{const sheet=XLSX.utils.aoa_to_sheet([['اسم الموقع','الكود'],['موقع عربي','0001'],[],['موقع آخر','0002']]);if(ref)sheet['!ref']=ref;const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'بيانات');return XLSX.write(book,{type:'base64',bookType:'xlsx'});};
 it('retains Arabic values leading zeros and physical blank row positions',async()=>{const rows=await readExcelRows(file(),true);expect(rows[1]).toEqual(['موقع عربي','0001']);expect(rows[2]).toEqual(['','']);expect(rows[3]).toEqual(['موقع آخر','0002']);});
 it('rejects column overflow before materializing rows',async()=>{await expect(readExcelRows(file('A1:BM4'))).rejects.toThrow('64');});
 it('rejects conflicting local ZIP size before handing the workbook to SheetJS',async()=>{
  const buffer=Buffer.from(file(),'base64');expect(buffer.readUInt32LE(0)).toBe(0x04034b50);
  buffer.writeUInt32LE(32*1024*1024+1,22);
  await expect(readExcelRows(buffer.toString('base64'))).rejects.toThrow('ترويسات');
 });
 it('rejects overflow after blank rows rather than importing a prefix',async()=>{await expect(readExcelRows(file('A1:B1002'))).rejects.toThrow('1000');});
 it('rejects a forged sparse range in a compact workbook',async()=>{
  const zip=XLSX.CFB.read(Buffer.from(file(),'base64'),{type:'buffer'});
  const entry=XLSX.CFB.find(zip,'/xl/worksheets/sheet1.xml')!;
  expect(entry).toBeTruthy();
  const xml=Buffer.from(entry.content).toString('utf8').replace('ref="A1:B4"','ref="A1:XFD1048576"');
  entry.content=Buffer.from(xml);entry.size=entry.content.length;
  const forged=XLSX.CFB.write(zip,{type:'buffer',fileType:'zip'});
  await expect(readExcelRows(Buffer.from(forged).toString('base64'))).rejects.toThrow('1000');
 });
});
