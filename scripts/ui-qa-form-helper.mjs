// Called only from cua_repl with its documented Tab API; never seeds through SQL or HTTP.
export async function seedOperationalRecord(tab, record, fixtures) {
  const dialog = tab.playwright.getByRole('dialog');
  const isAsset = record.entityType === 'asset';
  if (!await dialog.isVisible()) await tab.playwright.getByRole('button', { name: isAsset ? 'إضافة أصل' : 'إضافة عهدة', exact: true }).click();
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('textbox', { name: isAsset ? 'أدخل اسم الأصل' : 'أدخل اسم العهدة', exact: true }).fill(record.name);
  await dialog.getByRole('spinbutton').nth(0).fill(String(record.quantity));
  await dialog.getByRole('spinbutton').nth(1).fill(record.unitCost);
  const classification = fixtures.classifications.find(x => x.code === record.classificationCode);
  await dialog.getByRole('combobox').nth(0).selectOption({ label: `${classification.code} — ${classification.name}` });
  const d = Number(record.departmentKey.slice(1));
  const e = Number(record.employeeKey.slice(4));
  const prefix = String(d).padStart(2, '0');
  const labels = [
    `${prefix} — ${fixtures.locations.find(x => x.key === record.locationKey).name}`,
    `${prefix}-01 — ${fixtures.branches.find(x => x.key === record.branchKey).name}`,
    `${prefix}-01-001 — ${fixtures.departments.find(x => x.key === record.departmentKey).name}`,
    `${prefix}-01-001-${String((e - 1) % 10 + 1).padStart(4, '0')} — ${fixtures.employees.find(x => x.key === record.employeeKey).name}`,
  ];
  for (let index = 1; index <= 4; index++) {
    await dialog.getByRole('combobox').nth(index).press('ArrowDown');
    await tab.playwright.getByRole('listbox').waitFor({ state: 'visible' });
    const options = await tab.playwright.getByRole('listbox').getByRole('option').allTextContents({});
    if (!options.includes(labels[index - 1])) throw Error(`Expected visible option absent: ${labels[index - 1]}`);
    await tab.playwright.getByRole('option', { name: labels[index - 1], exact: true }).press('Enter');
    await dialog.getByRole('combobox').nth(index).getByText(labels[index - 1], { exact: true }).waitFor({ state: 'visible' });
  }
  await dialog.getByRole('textbox', { name: 'أدخل أي ملاحظات...', exact: true }).fill(`${record.key} | ${record.notes}`);
  await dialog.getByRole('button', { name: 'حفظ كمسودة', exact: true }).click();
  try { await dialog.waitFor({ state: 'hidden' }); }
  catch (error) {
    await tab.playwright.domSnapshot();
    if (await dialog.isVisible()) return { key: record.key, confirmed: false };
  }
  await tab.playwright.getByRole('cell', { name: record.name, exact: true }).waitFor({ state: 'visible' });
  await tab.playwright.domSnapshot();
  return { key: record.key, confirmed: true };
}
