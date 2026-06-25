/**
 * Migration + seed script.
 * Run:  npm run db:migrate
 *
 * Reads schema.sql, executes it against Neon, then seeds the
 * six default categories (idempotent — uses ON CONFLICT DO NOTHING).
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function banner(msg) {
  console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function migrate() {
  const client = await pool.connect();
  try {
    // ── 1. Test connection ────────────────────────────────────────
    banner('ConnectHive — database migration');
    const { rows: [{ now }] } = await client.query('SELECT NOW() AS now');
    console.log(`  Connected to Neon — server time: ${now}`);

    // ── 2. Run schema ─────────────────────────────────────────────
    console.log('\n  Applying schema.sql …');
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await client.query(sql);
    console.log('  ✓ Schema applied (IF NOT EXISTS — safe to re-run)');

    // ── 3. Report tables ──────────────────────────────────────────
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM   information_schema.tables
      WHERE  table_schema = 'public'
        AND  table_type   = 'BASE TABLE'
      ORDER  BY table_name
    `);
    console.log(`\n  Tables in public schema (${tables.length}):`);
    tables.forEach(({ table_name }) => console.log(`    • ${table_name}`));

    // ── 4. Seed categories ────────────────────────────────────────
    console.log('\n  Seeding default categories …');
    const categories = [
      ['Social Groups',             'Purpose-based social groups for building genuine friendships.'],
      ['Professional Networking',   'Groups for professionals sharing insights, opportunities, and career support.'],
      ['Travel Buddies',            'Crews of explorers for trips, adventures, and local discoveries.'],
      ['Project Collaboration',     'Groups for people building startups, apps, and creative work together.'],
      ['Event Buddies',             'Buddy networks for concerts, conferences, and events worth attending together.'],
      ['Specialized Groups',        'Focused groups built around one shared goal or interest.'],
    ];

    for (const [name, desc] of categories) {
      await client.query(
        `INSERT INTO categories (category_name, description)
         VALUES ($1, $2)
         ON CONFLICT (category_name) DO NOTHING`,
        [name, desc],
      );
      console.log(`    ✓ ${name}`);
    }

    banner('Migration complete — all tables ready');
  } catch (err) {
    console.error('\n  ✗ Migration failed:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('connect ETIMEDOUT')) {
      console.error('    → Check DATABASE_URL in server/.env — host may be wrong or unreachable.');
    } else if (err.message.includes('password authentication')) {
      console.error('    → Check the password in your DATABASE_URL connection string.');
    } else if (err.message.includes('SSL')) {
      console.error('    → SSL issue. Confirm ssl: { rejectUnauthorized: false } is set.');
    }
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
