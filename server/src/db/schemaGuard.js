/**
 * Boot-time schema guard.
 *
 * Deployed code and applied schema are two different things: Render builds
 * origin/main and starts the server, but schema.sql only runs if something
 * runs it. When they diverge the app boots happily and then 500s real users —
 * which is exactly how signup broke (INSERT into users.date_of_birth against a
 * table that had no such column).
 *
 * This checks, at startup, that the columns the code writes actually exist.
 * It does not refuse to boot: a crash loop turns a broken signup into a total
 * outage for everyone already using the app. Instead it logs unmistakably and
 * flips /api/health to 503, so the deploy is visibly unhealthy while reads
 * keep working.
 */
import { query } from './index.js';

// Columns schema.sql adds via ALTER. These are the ones that drift, because a
// missing CREATE TABLE fails loudly on its own.
const REQUIRED = {
  users: ['member_id', 'date_of_birth', 'terms_accepted_at', 'terms_policy_version',
          'email_verified', 'token_version', 'presence_status'],
  profiles: ['connection_purposes', 'social_preferences'],
  hives: ['hive_code', 'banner_url', 'logo_url', 'cadence', 'hive_values'],
  hive_members: ['welcome_seen_at', 'onboarding_status'],
  hive_posts: ['visibility'],
  messages: ['channel_id', 'edited_at', 'deleted_at'],
  post_comments: ['parent_comment_id'],
};

// What breaks for a user when a given column is absent. Generic guidance is
// useless at 3am; name the feature.
const IMPACT = {
  'users.date_of_birth':        'SIGNUP — every registration returns 500',
  'users.terms_accepted_at':    'SIGNUP — every registration returns 500',
  'users.terms_policy_version': 'SIGNUP — every registration returns 500',
  'users.email_verified':       'email verification',
  'users.token_version':        'logout-everywhere and password reset',
  'hives.hive_code':            'hive invite codes and direct hive links',
  'hive_posts.visibility':      'the hive feed — post queries fail',
  'messages.channel_id':        'hive chat channels',
};

let state = { checked: false, ok: true, missing: [] };

export function getSchemaState() {
  return state;
}

// `schema` is overridable so the guard can be exercised against a scratch
// schema in tests without touching production tables.
export async function checkSchema({ schema = 'public' } = {}) {
  const tables = Object.keys(REQUIRED);
  const { rows } = await query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = $2 AND table_name = ANY($1)`,
    [tables, schema],
  );

  const have = new Map();
  for (const r of rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name).add(r.column_name);
  }

  const missing = [];
  for (const [table, cols] of Object.entries(REQUIRED)) {
    const present = have.get(table);
    if (!present) { missing.push(`${table} (table absent)`); continue; }
    for (const c of cols) if (!present.has(c)) missing.push(`${table}.${c}`);
  }

  state = { checked: true, ok: missing.length === 0, missing };

  if (missing.length) {
    const line = '='.repeat(72);
    console.error(`\n${line}`);
    console.error('  SCHEMA OUT OF DATE — THE DATABASE IS BEHIND THE DEPLOYED CODE');
    console.error(line);
    console.error(`  ${missing.length} column(s) the code writes do not exist:\n`);
    for (const m of missing) {
      const impact = IMPACT[m];
      console.error(`    MISSING  ${m}${impact ? `\n             breaks: ${impact}` : ''}`);
    }
    console.error('\n  Fix:  npm run db:migrate --prefix server');
    console.error('  /api/health will report 503 until this is resolved.');
    console.error(`${line}\n`);
  } else {
    console.log('  [startup] schema check passed — all required columns present.');
  }

  return state;
}
