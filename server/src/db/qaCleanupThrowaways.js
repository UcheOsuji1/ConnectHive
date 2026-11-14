/**
 * Pre-beta QA helper (Prompt 84, Flow 16) — deletes every qa-throwaway-*
 * user (cascades to their memberships/profile/join_requests/etc.) and every
 * is_seed=FALSE Hive named with the qa-throwaway- prefix, then reports the
 * stray count so the spec can assert 0.
 *
 * Usage: node src/db/qaCleanupThrowaways.js
 * Prints { deletedUsers, deletedHives, strayUsers, strayHives }.
 */
import './../env.js';
import { pool } from './index.js';

async function main() {
  const { rowCount: deletedHives } = await pool.query(
    `DELETE FROM hives WHERE hive_name LIKE 'qa-throwaway-%' AND is_seed = FALSE`,
  );
  const { rowCount: deletedUsers } = await pool.query(
    `DELETE FROM users WHERE email LIKE 'qa-throwaway-%@qa.truehive.test'`,
  );
  const { rows: [{ n: strayUsers }] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM users WHERE email LIKE 'qa-throwaway-%@qa.truehive.test'`,
  );
  const { rows: [{ n: strayHives }] } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM hives WHERE hive_name LIKE 'qa-throwaway-%'`,
  );

  console.log(JSON.stringify({ deletedUsers, deletedHives, strayUsers, strayHives }));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
