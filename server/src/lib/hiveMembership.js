import { query } from '../db/index.js';

export async function getMembership(hiveId, userId) {
  const { rows: [row] } = await query(
    `SELECT role, membership_status, onboarding_status
     FROM hive_members
     WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
    [hiveId, userId],
  );
  return row ?? null;
}

export async function requireMembership(hiveId, userId) {
  const row = await getMembership(hiveId, userId);
  if (!row) {
    const err = new Error('You must be a member of this Hive.');
    err.status = 403;
    throw err;
  }
  return row;
}

// Server-side mirror of HiveDashboardLayout.jsx's `canPost` — owners/admins
// always can; a member mid-onboarding is blocked when the Hive's access_mode
// is 'limited' or 'none'. Used wherever a member creates content (chat
// messages today; Media & Files uploads here), so the rule never drifts
// between what the client hides and what the server actually allows.
export async function requireCanPost(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  const { rows: [settings] } = await query(
    `SELECT COALESCE(access_mode, 'full') AS access_mode
       FROM hive_onboarding_settings WHERE hive_id = $1`,
    [hiveId],
  );
  const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
  const isInOnboarding = !isOwnerOrAdmin && member.onboarding_status && member.onboarding_status !== 'completed';
  const accessMode = isInOnboarding ? (settings?.access_mode ?? 'full') : 'full';
  if (!isOwnerOrAdmin && accessMode !== 'full') {
    const err = new Error('Complete onboarding before uploading to this Hive.');
    err.status = 403;
    throw err;
  }
  return member;
}
