/** Decode storage paths once before checking their authorization namespace. */
export function canonicalFileKey(requestPath: string): string {
  if (!requestPath.startsWith('/api/files/')) throw new Error('Invalid file path');
  const parts=requestPath.slice('/api/files/'.length).split('/').map(decodeURIComponent);
  if(parts.some(part=>!part||part.includes('..')||/[\\/%\x00-\x1f\x7f"'<>]/.test(part)))throw new Error('Invalid file key');
  return parts.join('/');
}
export function mayDownloadFile(role:string,key:string):boolean {
  if (key.startsWith('backups/')) return role === 'owner';
  return ['owner','admin','accounting_manager','accountant'].includes(role);
}
