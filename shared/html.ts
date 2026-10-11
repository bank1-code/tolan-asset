/** Text and quoted HTML attributes; URL validation is a separate boundary. */
export function escapeHtml(value:unknown):string {
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
