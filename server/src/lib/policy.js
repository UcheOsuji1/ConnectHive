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

// A Hive's max_members is either null (no limit — the "Large" option) or a
// whole number in this range. One constant pair to change later if the
// launch number turns out wrong.
export const MAX_MEMBERS_MIN = 2;
export const MAX_MEMBERS_CAP = 100;

// Shared by createHive and the Manage Hive -> General update path, so the
// two can never drift on what's accepted. `currentMemberCount`, when given,
// additionally refuses a cap below the Hive's current active member count —
// not meaningful at creation (nobody's joined yet) so createHive omits it.
export function validateMaxMembers(raw, { currentMemberCount = null } = {}) {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < MAX_MEMBERS_MIN || n > MAX_MEMBERS_CAP) {
    return { error: `Max members must be between ${MAX_MEMBERS_MIN} and ${MAX_MEMBERS_CAP}.` };
  }
  if (currentMemberCount != null && n < currentMemberCount) {
    return { error: `This Hive already has ${currentMemberCount} members. Set the limit to ${currentMemberCount} or more.` };
  }
  return { value: n };
}

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
