/**
 * Pre-beta QA helper (Prompt 74 Flow 13) — runs the hourly purge job by
 * hand against whatever qa- fixture state is currently seeded.
 *
 * Usage: node src/db/qaRunPurgeJob.js
 */
import './../env.js';
import { pool } from './index.js';
import { runPurgeJob } from '../jobs/purgeJob.js';

async function main() {
  const result = await runPurgeJob();
  console.log(JSON.stringify(result));
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
