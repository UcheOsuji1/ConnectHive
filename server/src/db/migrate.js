/**
 * Migration runner.  Run:  npm run db:migrate
 *
 * Two distinct things happen here, and the distinction is the point:
 *
 *   1. schema.sql — STRUCTURAL only. CREATE TABLE / ADD COLUMN / CREATE INDEX,
 *      all IF NOT EXISTS. Re-running it a hundred times changes nothing after
 *      the first. Applied every time.
 *
 *   2. migrations/*.sql — ONE-TIME EFFECTS. Anything that writes or repairs
 *      DATA. These look idempotent because they are guarded by WHERE … IS NULL,
 *      but that guard also matches rows created later, which is precisely how
 *      the welcome-takeover backfill silently damaged 69 rows on 2026-09-25.
 *      Each runs at most once, inside its own transaction, and is recorded in
 *      schema_migrations by filename.
 *
 * Safe to run on every deploy. That is the whole reason for the split.
 */

import 'dotenv/config';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function banner(msg) {
  console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`);
}

async function migrate() {
  const client = await pool.connect();
  try {
    banner('TrueHive — database migration');
    const { rows: [{ now }] } = await client.query('SELECT NOW() AS now');
    console.log(`  Connected to Neon — server time: ${now}`);

    // ── 1. Ledger ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    // ── 2. Structural baseline ────────────────────────────────────
    console.log('\n  Applying schema.sql (structural, re-runnable) …');
    await client.query(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
    console.log('  ✓ structure up to date');

    // ── 3. One-time migrations ────────────────────────────────────
    const files = existsSync(MIGRATIONS_DIR)
      ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
      : [];

    const { rows: doneRows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(doneRows.map(r => r.name));

    console.log(`\n  One-time migrations (${files.length} on disk, ${done.size} already applied):`);
    let applied = 0;

    for (const file of files) {
      if (done.has(file)) {
        console.log(`    – skip    ${file}`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied++;
        console.log(`    ✓ APPLY   ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`    ✗ FAILED  ${file}`);
        console.error(`              ${err.message}`);
        console.error('\n  Migration aborted — nothing from this file was committed.');
        throw err;
      }
    }
    console.log(applied ? `\n  ${applied} migration(s) applied.` : '\n  Nothing new to apply.');

    // ── 4. Reference data ─────────────────────────────────────────
    // ON CONFLICT DO NOTHING — reference rows, not a data backfill.
    const categories = [
      ['Social Groups',           'Purpose-based social groups for building genuine friendships.'],
      ['Professional Networking', 'Groups for professionals sharing insights, opportunities, and career support.'],
      ['Travel Buddies',          'Crews of explorers for trips, adventures, and local discoveries.'],
      ['Project Collaboration',   'Groups for people building startups, apps, and creative work together.'],
      ['Event Buddies',           'Buddy networks for concerts, conferences, and events worth attending together.'],
      ['Specialized Groups',      'Focused groups built around one shared goal or interest.'],
    ];
    for (const [name, desc] of categories) {
      await client.query(
        `INSERT INTO categories (category_name, description)
         VALUES ($1, $2) ON CONFLICT (category_name) DO NOTHING`,
        [name, desc],
      );
    }
    console.log(`  Reference categories ensured (${categories.length}).`);

    banner('Migration complete');
  } catch (err) {
    console.error('\n  ✗ Migration failed:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('connect ETIMEDOUT')) {
      console.error('    → Check DATABASE_URL in server/.env — host may be wrong or unreachable.');
    } else if (err.message.includes('password authentication')) {
      console.error('    → Check the password in your DATABASE_URL connection string.');
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
