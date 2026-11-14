/**
 * Pre-beta QA helper (Prompt 84, Flow 16) — looks up one of the starter
 * (is_seed = TRUE) Hives by exact name, for the collab-walkthrough spec's
 * Discovery/Apply/roles assertions. Scoped to is_seed = TRUE so it can never
 * read a real user's Hive, mirroring qaGetHiveByName.js's qa- prefix scoping
 * for the throwaway-fixture Hives that script covers instead.
 *
 * Usage: node src/db/qaGetSeedHiveByName.js <hive_name>
 */
import './../env.js';
import { pool } from './index.js';

const [, , hiveName] = process.argv;

async function main() {
  const { rows: [hive] } = await pool.query(
    `SELECT hive_id, hive_name, max_members FROM hives WHERE hive_name = $1 AND is_seed = TRUE`,
    [hiveName],
  );
  if (!hive) { console.error('No such seed Hive:', hiveName); process.exit(1); }
  console.log(JSON.stringify(hive));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
