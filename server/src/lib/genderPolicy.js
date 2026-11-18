/**
 * Hive gender policy (Prompt 88) — the server's single definition of the
 * policies, their copy, and who fits. The SQL twin is gender_fits() in
 * schema.sql; `npm run check:gender` proves the two agree for every policy ×
 * gender combination, so a change to one without the other fails loudly.
 *
 * A member's gender is private: it is read here only to decide fit, and is
 * never returned about anyone but the viewer themselves.
 */

export const GENDERS = ['woman', 'man', 'nonbinary', 'prefer_not'];

export const POLICIES = {
  open:            { key: 'open',            label: 'Open to everyone',   badge: null,                 forText: null },
  women:           { key: 'women',           label: 'Women only',         badge: 'Women only',         forText: 'This Hive is for women' },
  men:             { key: 'men',             label: 'Men only',           badge: 'Men only',           forText: 'This Hive is for men' },
  women_nonbinary: { key: 'women_nonbinary', label: 'Women & non-binary', badge: 'Women & non-binary', forText: 'This Hive is for women and non-binary members' },
};
export const POLICY_KEYS = Object.keys(POLICIES);

export function isPolicy(key) {
  return POLICY_KEYS.includes(key);
}

// Must match SQL gender_fits() exactly (see check:gender). Unset or
// 'prefer_not' fits only 'open'; an unknown policy fits nobody.
export function fits(policy, gender) {
  switch (policy ?? 'open') {
    case 'open':            return true;
    case 'women':           return gender === 'woman';
    case 'men':             return gender === 'man';
    case 'women_nonbinary': return gender === 'woman' || gender === 'nonbinary';
    default:                return false;
  }
}

// The hive_members_gender_guard trigger raises exactly this.
export function isGenderPolicyError(err) {
  return err?.code === 'P0001' && err?.message === 'gender_policy';
}

// "This Hive is for women." — the 403 body every join path returns.
export function forbiddenBody(policy) {
  const text = POLICIES[policy]?.forText ?? "This Hive's membership settings don't include you";
  return { error: `${text}.`, code: 'gender_policy' };
}

// ── SQL fragments ────────────────────────────────────────────────────────────
// The viewer's own gender, by a user-id parameter placeholder like '$1'.
export const viewerGenderSql = (param) => `(SELECT gender FROM profiles WHERE user_id = ${param})`;

// A Hive (alias) is visible in discovery to the viewer when they fit it — or
// they're already an active member, or they follow it (never hidden).
export function genderVisibleClause(alias, param) {
  return `(gender_fits(${alias}.gender_policy, ${viewerGenderSql(param)})
           OR EXISTS (SELECT 1 FROM hive_members gvm WHERE gvm.hive_id = ${alias}.hive_id AND gvm.user_id = ${param} AND gvm.membership_status = 'active')
           OR EXISTS (SELECT 1 FROM hive_followers gvf WHERE gvf.hive_id = ${alias}.hive_id AND gvf.user_id = ${param}))`;
}

// viewer_fits for a Hive card: they fit, or they're already an active member
// (which covers the owner).
export function viewerFitsSql(alias, param) {
  return `(gender_fits(${alias}.gender_policy, ${viewerGenderSql(param)})
           OR EXISTS (SELECT 1 FROM hive_members vfm WHERE vfm.hive_id = ${alias}.hive_id AND vfm.user_id = ${param} AND vfm.membership_status = 'active'))`;
}
