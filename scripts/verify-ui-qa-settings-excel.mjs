// Read-only comparison of files downloaded through the application UI.
import {readFileSync,writeFileSync} from 'node:fs';
import * as XLSX from 'xlsx';
const dir='qa-results/ui-full-cycle';
const plan=JSON.parse(readFileSync(`${dir}/planned-data.json`,'utf8'));
const reference=JSON.parse(readFileSync(`${dir}/reference-data-verification.json`,'utf8')).observed;
const checks=[];
const check=(key,pass)=>checks.push({key,pass});
const rows=file=>{const w=XLSX.read(readFileSync(`${dir}/${file}`),{type:'buffer'});return XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,defval:''});};
const columns={locations:['الكود','اسم الموقع','بادئة الأصول','بادئة العهد'],branches:['الكود','اسم الفرع','كود الموقع','اسم الموقع'],departments:['الكود','اسم القسم','كود الفرع','اسم الفرع','كود الموقع','اسم الموقع'],employees:['رقم البصمة','اسم الموظف','رقم الهوية']};
for(const kind of Object.keys(columns)){
 const data=rows(`settings-${kind}-ui-export.xlsx`);
 check(`${kind}: export headers`,JSON.stringify(data[0])===JSON.stringify(columns[kind]));
 check(`${kind}: all records exported`,data.length-1===plan[kind].length);
 const template=rows(`settings-${kind}-ui-template.xlsx`);
 check(`${kind}: template headers`,JSON.stringify(template[0])===JSON.stringify(kind==='employees'?columns[kind]:columns[kind].slice(1)));
 check(`${kind}: one illustrative template row`,template.length===2);
 for(const expected of plan[kind]){
  const r=data.slice(1).filter(row=>row[1]===expected.name);
  check(`${kind}: ${expected.key} unique name`,r.length===1);
  if(r.length!==1)continue;
  const db=reference[kind].find(row=>(row.name||row.fullName)===expected.name);
  const loc=reference.locations.find(row=>row.id===(kind==='branches'?db.locationId:kind==='departments'?db.locationId:undefined));
  if(kind==='employees')check(`${kind}: ${expected.key} identity`,r[0][0]===expected.fingerprintId&&r[0][2]===expected.nationalId);
  else check(`${kind}: ${expected.key} code`,r[0][0]===db.code);
  if(kind==='locations')check(`${kind}: ${expected.key} prefixes`,r[0][2]===expected.assetPrefix&&r[0][3]===expected.custodyPrefix);
  if(kind==='branches')check(`${kind}: ${expected.key} parent`,r[0][2]===loc.code&&r[0][3]===loc.name);
  if(kind==='departments'){
   const branch=reference.branches.find(row=>row.id===db.branchId);
   check(`${kind}: ${expected.key} hierarchy`,r[0][2]===branch.code&&r[0][3]===branch.name&&r[0][4]===loc.code&&r[0][5]===loc.name);
  }
 }
}
const ui=JSON.parse(readFileSync(`${dir}/settings-import-observed.json`,'utf8'));
for(const c of ui.cases){
 check(`${c.case}: execute disabled`,c.executionDisabled);
 if(c.case.endsWith('duplicates')){
  const kind=c.case.split('-')[0];check(`${c.case}: all existing`,c.text.includes(`موجود / مكرر\n${plan[kind].length}\n`)&&c.text.includes('جاهز للإضافة\n0\n'));
 }else check(`${c.case}: parent mismatch rejected`,c.text.includes('اسم الموقع لا يطابق الكود')&&c.text.includes('مرفوض\n1\n'));
}
const result={status:checks.every(c=>c.pass)?'PASS':'FAIL',checkedAt:new Date().toISOString(),applicationDataModified:false,inputMethod:'Files downloaded and imports previewed through UI',passed:checks.filter(c=>c.pass).length,failed:checks.filter(c=>!c.pass).length,checks};
writeFileSync(`${dir}/settings-excel-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:checks.filter(c=>!c.pass)}));if(result.failed)process.exitCode=1;
