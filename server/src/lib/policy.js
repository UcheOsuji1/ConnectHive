// Shared policy constants — import these instead of hardcoding in multiple files.

// Version string baked into every consent record.
// Bump this when Terms or Privacy Policy content materially changes so existing
// consent records remain traceable to the document version users saw.
export const POLICY_VERSION = 'v2-2026-10';

// Minimum age in years. Must match the age stated in Terms of Service §2.
// Raised from 13 to 18 (POLICY_VERSION v2) — every account that consented
// under v1 is re-gated through requireConsent (see middleware/consent.js)
// until they confirm their date of birth and re-accept under v2.
export const MIN_AGE = 18;

// Compute age in full years from a date-of-birth string (YYYY-MM-DD).
export function ageFromDob(dob) {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return NaN;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
