import {it,expect} from 'vitest';
import * as XLSX from 'xlsx';
import {createExcelBuffer} from './excelUtils';
it('exports usable numeric quantities/values while preserving identifiers and literal text',()=>{
 const encoded=createExcelBuffer([{code:'00012',quantity:2,value:'510.00',name:'=SUM(A1:A2)'}],[{key:'code',label:'الرمز'},{key:'quantity',label:'الكمية',numeric:true},{key:'value',label:'القيمة',numeric:true},{key:'name',label:'الاسم'}],'الأصول');
 const sheet=XLSX.read(encoded,{type:'base64'}).Sheets['الأصول'];
 expect(sheet.A2).toMatchObject({t:'s',v:'00012'});expect(sheet.B2).toMatchObject({t:'n',v:2});expect(sheet.C2).toMatchObject({t:'n',v:510});expect(sheet.D2).toMatchObject({t:'s',v:'=SUM(A1:A2)'});expect(sheet.D2.f).toBeUndefined();
});
it('keeps amounts exceeding Excel precision as exact text instead of rounding',()=>{
 const encoded=createExcelBuffer([{value:'1234567890123456.78'}],[{key:'value',label:'القيمة',numeric:true}],'بيانات');
 expect(XLSX.read(encoded,{type:'base64'}).Sheets['بيانات'].A2).toMatchObject({t:'s',v:'1234567890123456.78'});
});
