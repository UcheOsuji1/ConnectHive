/**
 * Pre-beta QA helper (Prompt 74 Step 2) — looks up a Hive by exact name,
 * for assertions on fields the UI doesn't surface directly (metro_key).
 * Scoped to hive_name starting with 'qa-' so it can't read real Hives.
 *
 * Usage: node src/db/qaGetHiveByName.js <hive_name>
 */
import './../env.js';
import { pool } from './index.js';

const [, , hiveName] = process.argv;

if (!hiveName || !hiveName.startsWith('qa-')) {
  console.error('Refusing — only hive names starting with qa- are allowed.');
  process.exit(1);
}

async function main() {
  const { rows: [hive] } = await pool.query(
    `SELECT hive_id, hive_name, metro_key, location_type, max_members
     FROM hives WHERE hive_name = $1 ORDER BY created_at DESC LIMIT 1`,
    [hiveName],
  );
  if (!hive) { console.error('No such Hive:', hiveName); process.exit(1); }
  console.log(JSON.stringify(hive));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
