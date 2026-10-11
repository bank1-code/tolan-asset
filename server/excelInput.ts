import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {TRPCError} from '@trpc/server';
const xlsxPath=createRequire(import.meta.url).resolve('xlsx');
let active=0;
const workerSource=String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {inflateRawSync}=require('node:zlib');
try{
 const buffer=Buffer.from(workerData.base64,'base64');
 if(buffer.length>10*1024*1024)throw new Error('الملف يتجاوز 10 ميجابايت');
 // Bound actual ZIP output before SheetJS performs decompression, including forged size metadata.
 if(buffer.readUInt16LE(0)===0x4b50){
  let end=-1;for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(buffer.readUInt32LE(i)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('ملف ZIP غير صالح');
  const count=buffer.readUInt16LE(end+10),directory=buffer.readUInt32LE(end+16);
  if(count>256||directory===0xffffffff)throw new Error('بنية Excel تتجاوز الحدود المسموحة');
  let offset=directory,total=0;
  for(let entry=0;entry<count;entry++){
   if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new Error('بنية Excel غير صالحة');
   const flags=buffer.readUInt16LE(offset+8),method=buffer.readUInt16LE(offset+10),compressed=buffer.readUInt32LE(offset+20),size=buffer.readUInt32LE(offset+24),local=buffer.readUInt32LE(offset+42);
   if(flags&1||size===0xffffffff||compressed===0xffffffff||total+size>32*1024*1024||local+30>buffer.length||buffer.readUInt32LE(local)!==0x04034b50)throw new Error('ملف Excel مشفر أو يتجاوز حدود المعالجة');
   const localFlags=buffer.readUInt16LE(local+6),localMethod=buffer.readUInt16LE(local+8),localCompressed=buffer.readUInt32LE(local+18),localSize=buffer.readUInt32LE(local+22);
   if(localFlags!==flags||localMethod!==method||localSize>32*1024*1024||
      (localSize!==size&&!(flags&8&&localSize===0))||
      (localCompressed!==compressed&&!(flags&8&&localCompressed===0)))throw new Error('أحجام ترويسات Excel غير متطابقة');
   const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
   if(start+compressed>buffer.length)throw new Error('بنية Excel غير صالحة');
   const packed=buffer.subarray(start,start+compressed);
   const output=method===0?packed:method===8?inflateRawSync(packed,{maxOutputLength:Math.max(1,size)}):null;
   if(!output||output.length!==size)throw new Error('حجم محتوى Excel غير صالح');
   // SheetJS allocates from local sizes, including zero-size descriptor entries.
   // Both sizes now reflect the already verified, bounded central-directory data.
   buffer.writeUInt32LE(compressed,local+18);buffer.writeUInt32LE(size,local+22);
   total+=output.length;offset+=46+buffer.readUInt16LE(offset+28)+buffer.readUInt16LE(offset+30)+buffer.readUInt16LE(offset+32);
  }
 }
 const XLSX=require(workerData.xlsxPath);
 const book=XLSX.read(buffer,{type:'buffer',sheetRows:1002});
 const sheet=book.Sheets[book.SheetNames[0]];
 if(!sheet)throw new Error('الملف فارغ');
 for(const ref of [sheet['!ref'],sheet['!fullref']].filter(Boolean)){
  if(!/^[A-Z]+[1-9][0-9]*(?::[A-Z]+[1-9][0-9]*)?$/.test(ref))throw new Error('نطاق Excel غير صالح');
  const range=XLSX.utils.decode_range(ref);
  if(range.s.r>range.e.r||range.s.c>range.e.c||range.e.r>1000||range.e.c>63)throw new Error('الحد الأقصى 1000 صف بيانات و64 عمودًا، بما فيها الصفوف الفارغة');
 }
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:!workerData.formatted,defval:'',blankrows:true});
 parentPort.postMessage({rows});
}catch(error){parentPort.postMessage({error:error.message});}
`;
export async function readExcelRows(base64:string,formatted=false):Promise<any[][]>{
 if(base64.length>14*1024*1024)throw new TRPCError({code:'PAYLOAD_TOO_LARGE',message:'الملف يتجاوز 10 ميجابايت'});
 if(active>=2)throw new TRPCError({code:'TOO_MANY_REQUESTS',message:'يوجد استيراد قيد المعالجة؛ أعد المحاولة بعد قليل'});
 active++;
 try{return await new Promise<any[][]>((resolve,reject)=>{
  const worker=new Worker(workerSource,{eval:true,workerData:{base64,formatted,xlsxPath},resourceLimits:{maxOldGenerationSizeMb:128}});
  let settled=false;
  const finish=(error?:string,rows?:any[][])=>{if(settled)return;settled=true;clearTimeout(timeout);void worker.terminate().finally(()=>{error?reject(new TRPCError({code:'BAD_REQUEST',message:error})):resolve(rows!);});};
  const timeout=setTimeout(()=>finish('انتهت مهلة معالجة Excel؛ استخدم ملفًا أصغر'),5000);
  worker.once('message',data=>finish(data.error,data.rows));
  worker.once('error',()=>finish('تعذر معالجة Excel ضمن حدود الذاكرة'));
  worker.once('exit',()=>{if(!settled)finish('تعذر معالجة ملف Excel');});
 });}finally{active--;}
}
