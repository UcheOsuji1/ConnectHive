// Mirrors server/src/lib/validateUrl.js exactly — client-side validation is
// a UX convenience only; the server re-validates on save.
export function validateUrl(raw) {
  if (raw == null || raw === '') return { url: null };
  const str = String(raw).trim();
  if (str.length > 2000) return { error: 'Link must be 2000 characters or fewer.' };
  let u;
  try { u = new URL(str); } catch { return { error: 'Link must be a valid URL.' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'Link must start with http:// or https://.' };
  }
  return { url: str };
}
