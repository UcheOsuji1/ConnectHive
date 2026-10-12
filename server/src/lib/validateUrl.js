// Shared http/https-only URL validator — same rule Opportunities (Prompt 65)
// enforces, pulled out here because Itinerary and Ideas (Prompt 66) both
// need it too. Nothing is ever fetched server-side; this only checks shape.
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
