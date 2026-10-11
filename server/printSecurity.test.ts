import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {escapeHtml} from '../shared/html';
import {generateExclusionReport} from '../client/src/lib/exclusionReport';
import {generateClearanceReport} from '../client/src/lib/clearanceReport';
const malicious='<img src=x onerror="alert(1)"><script>alert(2)</script>&';
function printFunction(file:string,name:string,bindings:Record<string,unknown>,argument?:unknown){
 const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let code='';
 function visit(node:ts.Node){
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)===name&&node.initializer)code='const run = '+node.initializer.getText(source)+';';
  if(ts.isFunctionDeclaration(node)&&node.name?.text===name)code=node.getText(source)+`; const run = ${name};`;
  ts.forEachChild(node,visit);
 }
 visit(source);if(!code)throw Error('Missing print function '+name);
 let html='';const win={document:{write:(s:string)=>html+=s,close:()=>{}},focus:()=>{},print:()=>{}};
 const context=vm.createContext({escapeHtml,window:{open:()=>win},toast:{error:()=>{},warning:()=>{}},...bindings,argument});
 vm.runInContext(ts.transpileModule(code+'run(argument);',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 expect(html).not.toContain(malicious);expect(html).toContain(escapeHtml(malicious));expect(html).not.toContain('<script>alert(2)</script>');return html;
}
describe('untrusted text stays text in all affected print paths',()=>{
 it('audit history including unknown labels and filter names',()=>{printFunction('client/src/pages/AuditLog.tsx','handlePrint',{rows:[{createdAt:new Date(),actionType:malicious,tableName:malicious,actionDescription:malicious,performedByName:malicious,ipAddress:malicious}],activeFilters:[malicious],tableNameLabels:{},actionTypeLabels:{},total:1});});
 it('transfer snapshot names and notes',()=>{printFunction('client/src/pages/Transfers.tsx','printTransferSheet',{}, {id:1,createdAt:new Date(),entityType:'asset',entityName:malicious,entityCode:malicious,fromEmployeeName:malicious,toEmployeeName:malicious,notes:malicious,quantity:1});});
 it('reports and filter text',()=>{printFunction('client/src/pages/Reports.tsx','handlePrintPreview',{filteredData:[{report_type:'أصل',code:malicious,name:malicious,quantity:1,owner_name:malicious,department:malicious,branch:malicious,location:malicious,condition:malicious,notes:malicious}],activeFilters:[malicious],showUnitValue:false,showTotalColumn:false,showTotalRow:false,stats:{count:1,totalAssets:1,totalCustody:0,totalOverall:1},formatCurrency:String,formatNumber:String});});
 for(const name of ['Assets','Custody'])it(`${name} retains image elements and escapes names`,()=>{
  const isAsset=name==='Assets';const html=printFunction(`client/src/pages/${name}.tsx`,'handlePrint',{savedData:{asset_name:malicious,custody_name:malicious,name:malicious,asset_code:malicious,custody_code:malicious,quantity:1,assigned_to:'1',department:'1',location:'1',condition:malicious,notes:malicious},employees:[{id:1,fullName:malicious}],departments:[{id:1,name:malicious}],locations_:[{id:1,name:malicious}],documentCode:malicious,saveDate:'2026-10-07',uploadedAssetImageUrl:'/api/files/images/a.webp',uploadedCustodyImageUrl:'/api/files/images/a.webp',uploadedInvoiceImageUrl:'/api/files/images/invoice.webp'});
  expect(html).toContain('<img src="/api/files/images/a.webp"');expect(html).toContain('<img src="/api/files/images/invoice.webp"');
 });
 it('exclusion reason signatures and image query strings',()=>{
  const html=generateExclusionReport({exclusionCode:malicious,exclusionMode:'partial',entityType:'asset',entityName:malicious,entityCode:malicious,reason:malicious,quantityBefore:2,quantityExcluded:1,quantityRemaining:1,responsibles:[{name:malicious,job:malicious}],exclusionDate:'2026-10-07',images:['https://storage.example/a.webp?a=1&b=2']});
  expect(html).not.toContain(malicious);expect(html).toContain(escapeHtml(malicious));expect(html).toContain('a=1&amp;b=2');expect(html).not.toContain('&amp;amp;');
 });
 it('clearance grouping alternate names statements and signatures',()=>{
  const html=generateClearanceReport({employeeName:malicious,fingerprintId:1,idNumber:malicious,reason:malicious,lastWorkDay:'2026-10-07',dayName:malicious,statements:[malicious],signatures:[malicious],assets:[{department:malicious,items:[{id:1,name:malicious,code:malicious,quantity:1}]}],custody:[],departmentAlternates:{[malicious]:malicious},clearanceCode:malicious});
  expect(html).not.toContain(malicious);expect(html).toContain(escapeHtml(malicious));expect(html).toContain('<li class="first-statement">');
 });
});
