// Explicit opt-in: synthetic schema on the verified Neon dev branch only.
// No public fallback: fixture SQL cannot resolve existing development tables.
import fs from 'node:fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
if (process.env.P73A_VERIFIED_DEV_TESTS !== '1') throw Error('Explicit dev fixture opt-in required');
const env = dotenv.parse(fs.readFileSync(process.env.P73A_ENV_FILE || new URL('../../.env', import.meta.url)));
const target = new URL(env.DATABASE_URL);
if (target.hostname.split('.')[0].replace(/-pooler$/, '') !== 'ep-fancy-cherry-at7zftnq') throw Error('Wrong dev endpoint');
const admin = new pg.Client({ connectionString: env.DATABASE_URL });
await admin.connect();
const schema = `p73a_system_${randomUUID().replaceAll('-', '')}`;
try {
  const { rows: [meta] } = await admin.query("SELECT current_setting('neon.branch_id',true) AS branch");
  if (meta.branch !== 'br-holy-poetry-atkl4gsc') throw Error('Wrong Neon branch');
  await admin.query('BEGIN');
  await admin.query(`CREATE SCHEMA ${schema}`);
  await admin.query(`SET LOCAL search_path TO ${schema}`);
  const db = new URL('../db/', import.meta.url);
  await admin.query(fs.readFileSync(new URL('schema.sql', db), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', ''));
  await admin.query(fs.readFileSync(new URL('billing.sql', db), 'utf8'));
  for (const file of fs.readdirSync(new URL('migrations/', db)).filter(f => f.endsWith('.sql')).sort()) {
    await admin.query(fs.readFileSync(new URL(`migrations/${file}`, db), 'utf8'));
  }
  await admin.query('COMMIT');
} catch (error) {
  await admin.query('ROLLBACK');
  await admin.end();
  throw Error(`Dev fixture setup failed: ${error.code || error.name}`);
}
// Neon pooler rejects startup search_path. The direct host is the same verified endpoint.
target.hostname = target.hostname.replace('-pooler.', '.');
target.searchParams.set('options', `-c search_path=${schema}`);
process.env.DATABASE_URL = target.href;
process.env.P71B_ISOLATED = '1';
for (const key of ['RESEND_API_KEY', 'ANTHROPIC_API_KEY', 'SENTRY_DSN', 'CLOUDINARY_API_SECRET']) process.env[key] = '';
const { pool } = await import('../db/index.js');
pool.verifiedDevFixture = true;
pool.isolatedExec = sql => pool.query(sql);
const end = pool.end.bind(pool);
pool.end = async () => {
  try { await end(); }
  finally {
    // Generated name only; never accept a supplied cleanup target.
    try { await admin.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await admin.end(); }
  }
};
console.log(`Verified Neon dev; isolated synthetic schema ${schema}; existing records inaccessible to fixture SQL.`);
