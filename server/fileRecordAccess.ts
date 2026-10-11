import { and, eq, or, sql } from 'drizzle-orm';
import { assets, custodyItems, appSettings, type User } from '../drizzle/schema';
import { getDb } from './db';
import { mayDownloadFile } from './fileAccess';

/** Current assignment is checked before issuing any temporary download capability. */
export async function mayDownloadRecordFile(user: User, key: string): Promise<boolean> {
  if (mayDownloadFile(user.role, key)) return true;
  if (user.role !== 'employee') return false;
  const database = await getDb();
  if (!database) return false;
  const path = '/api/files/' + key.split('/').map(encodeURIComponent).join('/');
  if (key.startsWith('images/branding/')) {
    const [branding] = await database.select({id:appSettings.id}).from(appSettings).where(eq(appSettings.logoUrl,path)).limit(1);
    return Boolean(branding);
  }
  if (!user.employeeId || !/^images\/(asset|custody|invoice)\//.test(key)) return false;
  for (const table of [assets, custodyItems]) {
    const [record] = await database.select({id:table.id}).from(table).where(and(
      eq(table.assignedTo, user.employeeId), sql`${table.status} NOT IN ('DRAFT','CANCELLED')`,
      or(eq(table.assetImagePath, path), eq(table.invoiceImagePath, path))
    )).limit(1);
    if (record) return true;
  }
  return false;
}
