// Test accounts Uche wants out of the signup funnel — comma-separated env
// var, same shape as SITE_ADMIN_EMAILS in lib/siteAdmin.js. Optional: an
// empty/unset value excludes nobody extra.
let cachedEmails = null;

export function funnelExcludedEmails() {
  if (cachedEmails) return cachedEmails;
  const raw = process.env.FUNNEL_EXCLUDE_EMAILS ?? '';
  cachedEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  return cachedEmails;
}
