// Hive gender policy (Prompt 88) — client copy of server/src/lib/genderPolicy.js.
// The server is the authority (it hides, blocks and 403s); this only decides
// which options to enable and what a card says. Keep fits() identical to the
// server's, which check:gender proves matches SQL gender_fits().

export const POLICIES = {
  open:            { key: 'open',            label: 'Open to everyone',   desc: 'Default. Anyone can find and join.',     badge: null,                 forText: null },
  women:           { key: 'women',           label: 'Women only',         desc: 'Only members who identify as women.',    badge: 'Women only',         forText: 'This Hive is for women' },
  men:             { key: 'men',             label: 'Men only',           desc: 'Only members who identify as men.',      badge: 'Men only',           forText: 'This Hive is for men' },
  women_nonbinary: { key: 'women_nonbinary', label: 'Women & non-binary', desc: 'Women and non-binary members.',          badge: 'Women & non-binary', forText: 'This Hive is for women and non-binary members' },
};
export const POLICY_ORDER = ['open', 'women', 'men', 'women_nonbinary'];

export const GENDER_OPTIONS = [
  { value: 'woman',      label: 'Woman' },
  { value: 'man',        label: 'Man' },
  { value: 'nonbinary',  label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];
export const genderLabel = (g) => GENDER_OPTIONS.find(o => o.value === g)?.label ?? null;

export function fits(policy, gender) {
  switch (policy ?? 'open') {
    case 'open':            return true;
    case 'women':           return gender === 'woman';
    case 'men':             return gender === 'man';
    case 'women_nonbinary': return gender === 'woman' || gender === 'nonbinary';
    default:                return false;
  }
}

export const policyBadge = (policy) => POLICIES[policy]?.badge ?? null;
export const forText = (policy) => POLICIES[policy]?.forText ?? 'This Hive’s membership settings don’t include you';

// Saves the viewer's own private gender (the only write path).
export async function saveMyGender(api, gender) {
  const d = await api.put('/api/users/profile/gender', { gender: gender || null });
  return d.gender;
}
