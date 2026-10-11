// Used only inside cua_repl with a documented browser Tab. No database/API writes.
export async function approveVisibleDrafts(tab, limit=8) {
  if(await tab.playwright.getByRole('dialog').count()) throw new Error('Resolve the open dialog before starting a batch');
  const saved=[];
  for(let i=0;i<limit;i++) {
    const row=tab.playwright.getByRole('row').filter({hasText:'مسودة بانتظار الاعتماد'}).first();
    try { await row.waitFor({state:'visible',timeoutMs:5000}); } catch { return {saved,noVisibleDraft:true}; }
    await row.getByRole('button',{name:'عرض',exact:true}).click();
    const detailDialog=tab.playwright.getByRole('dialog').filter({hasText:/تفاصيل الأصل|تفاصيل العهدة/});
    const details=await detailDialog.innerText();
    const key=details.match(/QA-[AC]-[A-Z]+-\d+/)?.[0];
    if(!key)throw new Error('Unexpected non-fixture record');
    await tab.playwright.getByRole('button',{name:'اعتماد وقفل البيانات',exact:true}).click();
    await tab.playwright.getByRole('button',{name:'تأكيد الاعتماد',exact:true}).click();
    try { await detailDialog.waitFor({state:'hidden',timeoutMs:10000}); }
    catch(error) { return {saved,pending:key,waitError:error.message}; }
    await tab.playwright.domSnapshot();
    saved.push(key);
  }
  return {saved};
}
