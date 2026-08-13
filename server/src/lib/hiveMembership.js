import { query } from '../db/index.js';

export async function getMembership(hiveId, userId) {
  const { rows: [row] } = await query(
    `SELECT role, membership_status
     FROM hive_members
     WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
    [hiveId, userId],
  );
  return row ?? null;
}

export async function requireMembership(hiveId, userId) {
  const row = await getMembership(hiveId, userId);
  if (!row) {
    const err = new Error('You must be a member of this Hive to access its chat.');
    err.status = 403;
    throw err;
  }
  return row;
}
