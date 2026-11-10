// Validation and capacity logic for Hive collab data (Project/Professional
// basics + roles) — Prompt 78. Everything that leaves here is a vocabulary
// KEY, never a display string; collabVocabulary.js is the single source of
// truth for what a key means, this module is the gate between an API
// request and the hives/hive_roles columns.
import { excludeSystemClause } from './systemUser.js';
import {
  PROJECT_TYPES, PROJECT_STAGES, PROJECT_TIMELINES, COMMITMENTS, WORK_STYLES,
  FUNDING, COMPENSATION, PROJECT_INDUSTRIES, PRO_INDUSTRIES, CAREER_STAGES,
  INDUSTRY_SCOPES, EXPERIENCE_LEVELS, COLLAB_LIMITS, keyForLabel, skillLabel,
} from './collabVocabulary.js';

export const PROJECT_CATEGORY = 'Project Collaboration';
export const PROFESSIONAL_CATEGORY = 'Professional Networking';

const PROJECT_FIELDS = [
  'project_types', 'project_stage', 'project_timeline', 'commitment',
  'work_style', 'funding', 'compensation', 'project_industries',
];
const PROFESSIONAL_FIELDS = ['pro_industries', 'career_stages', 'audience_scope'];

function dedupeBy(arr, keyFn, max) {
  const out = [];
  const seen = new Set();
  for (const raw of arr ?? []) {
    const k = keyFn(raw);
    if (k == null || seen.has(k)) continue;
    seen.add(k);
    out.push(raw);
  }
  return max != null ? out.slice(0, max) : out;
}

// Multi-select of vocabulary items -> deduped array of keys. Unmatched
// entries are dropped with a console.warn, not stored — only project_types
// has an "_other" bucket at the Hive level (schema.sql's project_types_other).
// `max`, when given, silently caps the result (the client-side chip picker
// already disables past the cap; this is a defensive ceiling, not product UX).
function multiKeys(list, values, field, max) {
  if (values === undefined) return [];
  const keys = [];
  for (const v of values ?? []) {
    const key = keyForLabel(list, v);
    if (key) { keys.push(key); continue; }
    console.warn(`[collab] unknown value for ${field}, dropped:`, v);
  }
  const deduped = [...new Set(keys)];
  return max != null ? deduped.slice(0, max) : deduped;
}

function singleKeyOrError(list, value, label) {
  if (value == null || value === '') return { value: null };
  const key = keyForLabel(list, value);
  if (!key) return { error: `${label} isn't a recognized option.` };
  return { value: key };
}

// Roles array -> normalized { role_id, title, slots, skills, experience_level,
// status }[]. Title trimmed, empty dropped, duplicates allowed. Skills
// deduped via skillLabel, capped at maxSkillsPerRole. Slots and role count
// are enforced as hard errors here (an owner explicitly submitting a roles
// list is not the same case as a UI multi-select silently trimming).
function validateRoles(roles) {
  if (roles === undefined) return { value: undefined };
  if (!Array.isArray(roles)) return { error: 'Roles must be a list.' };
  if (roles.length > COLLAB_LIMITS.maxRoles) {
    return { error: `You can have at most ${COLLAB_LIMITS.maxRoles} roles.` };
  }
  const out = [];
  for (const r of roles) {
    const title = String(r?.title ?? '').trim().slice(0, COLLAB_LIMITS.maxRoleTitle);
    if (!title) continue;
    const slotsNum = Number(r?.slots);
    if (!Number.isFinite(slotsNum) || slotsNum < 1 || slotsNum > COLLAB_LIMITS.maxSlotsPerRole) {
      return { error: `"${title}" needs between 1 and ${COLLAB_LIMITS.maxSlotsPerRole} spots.` };
    }
    const skills = dedupeBy(
      (r?.skills ?? []).map(s => String(s).trim()).filter(Boolean),
      skillLabel,
      COLLAB_LIMITS.maxSkillsPerRole,
    );
    let experience_level = null;
    if (r?.experience_level != null && r.experience_level !== '') {
      const key = keyForLabel(EXPERIENCE_LEVELS, r.experience_level);
      if (!key) return { error: `"${title}" has an unrecognized experience level.` };
      experience_level = key;
    }
    const status = r?.status === 'closed' ? 'closed' : 'open';
    out.push({
      role_id: r?.role_id ?? null,
      title,
      slots: Math.round(slotsNum),
      skills,
      experience_level,
      status,
    });
  }
  return { value: out };
}

function validateProject(body) {
  const typeKeys = [];
  const typesOther = [];
  for (const v of body.project_types ?? []) {
    const key = keyForLabel(PROJECT_TYPES, v);
    if (key) { typeKeys.push(key); continue; }
    const text = String(v).trim().slice(0, COLLAB_LIMITS.maxOtherLength);
    if (text) typesOther.push(text);
  }
  const project_types = [...new Set(typeKeys)];
  const project_types_other = dedupeBy(typesOther, skillLabel, COLLAB_LIMITS.maxOther);

  const stageR = singleKeyOrError(PROJECT_STAGES, body.project_stage, 'Project stage');
  if (stageR.error) return stageR;
  const timelineR = singleKeyOrError(PROJECT_TIMELINES, body.project_timeline, 'Timeline');
  if (timelineR.error) return timelineR;
  const commitmentR = singleKeyOrError(COMMITMENTS, body.commitment, 'Commitment');
  if (commitmentR.error) return commitmentR;
  const workStyleR = singleKeyOrError(WORK_STYLES, body.work_style, 'Work style');
  if (workStyleR.error) return workStyleR;
  const fundingR = singleKeyOrError(FUNDING, body.funding, 'Funding');
  if (fundingR.error) return fundingR;

  const compensation = multiKeys(COMPENSATION, body.compensation, 'compensation');
  if (!compensation.length) {
    return { error: 'Choose at least one thing you can offer collaborators.' };
  }
  const project_industries = multiKeys(PROJECT_INDUSTRIES, body.project_industries, 'project_industries');

  const rolesR = validateRoles(body.roles);
  if (rolesR.error) return rolesR;

  return {
    value: {
      project_types, project_types_other,
      project_stage: stageR.value, project_timeline: timelineR.value,
      commitment: commitmentR.value, work_style: workStyleR.value, funding: fundingR.value,
      compensation, project_industries,
      roles: rolesR.value,
    },
  };
}

function validateProfessional(body) {
  const scopeR = singleKeyOrError(INDUSTRY_SCOPES, body.audience_scope, 'Audience scope');
  if (scopeR.error) return scopeR;

  const pro_industries = multiKeys(PRO_INDUSTRIES, body.pro_industries, 'pro_industries', COLLAB_LIMITS.maxProIndustries);
  // Required unless the owner picked Cross-industry — same rule the client
  // enforces in CreateHivePage's validate().
  if (!pro_industries.length && scopeR.value !== 'cross') {
    return { error: 'Pick at least one industry, or choose Cross-industry.' };
  }

  const career_stages = multiKeys(CAREER_STAGES, body.career_stages, 'career_stages');

  return {
    value: { pro_industries, career_stages, audience_scope: scopeR.value },
  };
}

// categoryName is the real DB categories.category_name string (see
// CATEGORY_NAME_MAP in hivesController.js). Project Hives accept project
// fields + roles; Professional Hives accept "who it's for" fields only, no
// roles; any other category, or a cross-category field, is a 400.
export function validateCollab(categoryName, body = {}) {
  const hasProjectFields = PROJECT_FIELDS.some(f => body[f] !== undefined) || body.roles !== undefined;
  const hasProFields = PROFESSIONAL_FIELDS.some(f => body[f] !== undefined);

  if (categoryName === PROJECT_CATEGORY) {
    if (hasProFields) return { error: "This Hive is a Project Hive — Professional fields don't apply." };
    return validateProject(body);
  }
  if (categoryName === PROFESSIONAL_CATEGORY) {
    if (hasProjectFields) return { error: "This Hive is a Professional Hive — Project fields don't apply." };
    return validateProfessional(body);
  }
  return { error: "This Hive's category doesn't support collab basics." };
}

// hive: { max_members }. roles: the Hive's desired/current role list, each
// annotated with a `filled` count by the caller (hive_members with
// collab_role_id = that role, active, non-system) — this function is pure
// and never queries the DB itself. currentMemberCount: active, non-system
// members the Hive already has. No max_members set -> no check (uncapped).
export function roleCapacityError(hive, roles, currentMemberCount) {
  if (!hive?.max_members) return null;
  const openSpots = (roles ?? [])
    .filter(r => r.status === 'open')
    .reduce((sum, r) => sum + Math.max(0, r.slots - (r.filled ?? 0)), 0);
  const roomLeft = hive.max_members - currentMemberCount;
  if (openSpots > roomLeft) {
    return `These roles add ${openSpots} open spots, but your Hive only has room for ${roomLeft} more members. Raise the member limit or reduce spots.`;
  }
  return null;
}

// True when a Hive is NOT "every open role is filled" — a Hive with no
// roles at all is unaffected (always true), same as any non-Project Hive.
// `alias` is the hives table alias in scope ('h', ''...).
export function openRolesClause(alias) {
  const hiveIdCol = alias ? `${alias}.hive_id` : 'hive_id';
  return `(
    NOT EXISTS (SELECT 1 FROM hive_roles hr WHERE hr.hive_id = ${hiveIdCol})
    OR EXISTS (
      SELECT 1 FROM hive_roles hr
       WHERE hr.hive_id = ${hiveIdCol} AND hr.status = 'open'
         AND hr.slots > (
           SELECT COUNT(*) FROM hive_members hm
            WHERE hm.collab_role_id = hr.role_id AND hm.membership_status = 'active'
              AND ${excludeSystemClause('hm')}
         )
    )
  )`;
}
