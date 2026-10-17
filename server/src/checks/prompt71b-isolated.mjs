// Optional test-only preload. No network or production database connections.
// Install PGlite in the OS temp directory; see PROMPT71B_HANDOFF.md.
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';

process.env.DATABASE_URL = 'postgresql://isolated@127.0.0.1:1/prompt71b_test';
process.env.P71B_ISOLATED = '1';
process.env.RESEND_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
const require = createRequire(join(process.env.P71B_TEST_TOOLS || join(tmpdir(), 'truehive-p71b-tools'), 'package.json'));
const { PGlite } = await import(pathToFileURL(require.resolve('@electric-sql/pglite')).href);
const { pgcrypto } = await import(pathToFileURL(require.resolve('@electric-sql/pglite/contrib/pgcrypto')).href);
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
for (const file of (await readdir(new URL('../db/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
}
for (const name of ['Social Groups', 'Professional Networking', 'Travel Buddies', 'Project Collaboration', 'Event Buddies', 'Specialized Groups']) {
  await db.query('INSERT INTO categories (category_name) VALUES ($1)', [name]);
}
const { pool } = await import('../db/index.js');
const query = async (sql, params) => {
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {} });
pool.end = () => db.close();
console.log('ISOLATED PostgreSQL/WASM fixture database: full schema and numbered migrations; production inaccessible.');
