/** Persisted uploads use either an HTTP URL or the application's file route. */
export function isStoredImageUrl(value: string): boolean {
  if (!value || /[\s"'<>\\]/.test(value)) return false;
  if (value.startsWith("/api/files/")) {
    if (/[?#]/.test(value)) return false;
    try {
      return value.slice("/api/files/".length).split("/").every(segment => {
        const decoded = decodeURIComponent(segment);
        return decoded.length > 0 && decoded !== "." && decoded !== ".." && !/[\/\\\s"'<>\x00-\x1f\x7f]/.test(decoded);
      });
    } catch { return false; }
  }
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

// Historical reports may contain inline images saved before upload storage.
export function isDisplayImageUrl(value: string): boolean {
  return isStoredImageUrl(value) || /^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value);
}
