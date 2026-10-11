// Application-page interactions only. No database or HTTP writes.
export async function fillFinancialFile(tab, plan, record, visibleOption) {
  const role = (type, name) => tab.playwright.getByRole(type, {name, exact:true});
  await role('combobox','فتح مسودة مالية').selectOption({label:'دفعة جديدة'});
  await role('combobox','الأصل / العهدة').selectOption({label:visibleOption.label});
  await role('combobox','التهيئة المعتمدة السارية').selectOption({label:'#30001 — 2025-01-01'});
  const fields = {
    'اسم الدفعة':`${record.key} | ${record.name}`,
    'تكلفة الوحدة المعترف بها':record.unitCost,
    'القيمة المتبقية لكل وحدة':record.unitResidual,
    'مجمع الإهلاك الافتتاحي للدفعة كاملة':'0',
    'مجمع انخفاض قيمة مثبت سابقاً للدفعة':'0',
    'مرجع الفاتورة / مستند الأرصدة':record.documentReference,
    'مركز التكلفة':plan.departments.find(d=>d.key===record.departmentKey).name,
    'الموقع':plan.locations.find(d=>d.key===record.locationKey).name,
    'الفرع':plan.branches.find(d=>d.key===record.branchKey).name,
    'القسم':plan.departments.find(d=>d.key===record.departmentKey).name,
    'معرفات الوحدات — كل وحدة في سطر':record.units.join('\n'),
    'ملاحظات':record.notes,
  };
  for (const [label,value] of Object.entries(fields)) await role('textbox',label).fill(value);
  await role('spinbutton','عدد الوحدات').fill(String(record.quantity));
  await role('spinbutton','العمر المتبقي بالأشهر').fill(String(record.lifeMonths));
  for(const [label,field] of [['تاريخ الاعتراف بالتكلفة','recognitionDate'],['تاريخ الجاهزية للاستخدام','availableForUseDate'],['تاريخ بداية الرصيد المالي','balanceDate']]) {
    const input=role('textbox',label);
    await input.fill(record[field]);
    await input.press('ArrowUp');
    await input.press('ArrowDown');
    const actual=await input.evaluate(e=>({value:e.value,attribute:e.getAttribute('value')}));
    if(actual.value!==record[field]||actual.attribute!==record[field]) throw new Error(`Date input not committed: ${record.key} ${field}`);
  }
}
export async function saveFinancialFile(tab,key) {
  await tab.playwright.getByRole('button',{name:'حفظ الملف كمسودة',exact:true}).click();
  await tab.playwright.domSnapshot();
  const row=tab.playwright.getByRole('row').filter({hasText:`${key} |`});
  let text;
  try { text=await row.innerText({timeoutMs:15000}); }
  catch(error) {
    // Re-read after a delayed table refresh; never repeat a save on uncertainty.
    await tab.playwright.domSnapshot();
    text=await row.innerText({timeoutMs:10000});
  }
  if(!text.includes('مسودة')) throw new Error(`Unexpected saved state: ${text}`);
  return {key,text};
}
export async function transitionFinancialFile(tab,key,action,expectedStatus) {
  const row=tab.playwright.getByRole('row').filter({hasText:`${key} |`});
  const button=row.getByRole('button',{name:action,exact:true});
  await button.click();
  try { await button.waitFor({state:'hidden',timeoutMs:15000}); }
  catch(error) { await tab.playwright.domSnapshot(); }
  const text=await row.innerText();
  if(!text.includes(expectedStatus)) throw new Error(`Unconfirmed ${action}: ${key}: ${text}`);
  return {key,text};
}
