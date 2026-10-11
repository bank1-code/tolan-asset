// Generates the user-requested new account passwords locally only.
// Does not enter credentials in a browser, create accounts, or modify the DB.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const path = 'qa-results/ui-full-cycle/qa-login-details.txt';
const accounts = [
  { name: 'مدير الحسابات', username: 'qa_finance_manager', role: 'مدير الحسابات' },
  { name: 'المحاسب', username: 'qa_accountant', role: 'المحاسب' },
];
const content = accounts.map(account => [
  `الاسم: ${account.name}`, `اسم المستخدم: ${account.username}`,
  `الدور: ${account.role}`, `كلمة المرور المقترحة: ${randomBytes(18).toString('base64url')}!A7`,
].join('\r\n')).join('\r\n\r\n');
writeFileSync(path, 'حسابات التجربة — كلمات مرور مقترحة، لم تُحفظ الحسابات بعد.\r\n\r\n' + content + '\r\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: 'PASSWORDS_GENERATED_LOCALLY_ONLY', path, accounts: accounts.map(({ name, username, role }) => ({ name, username, role })), databaseModified: false }));
