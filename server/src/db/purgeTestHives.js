/**
 * TrueHive — purge old test Hives (Prompt 75, Step 9)
 *
 * Deletes every Hive except: the 30 starter Hives (is_seed = true), and the
 * "Luu and Chuu" fixture (trimmed, case-insensitive, exact match — the spec
 * names this as two separate Hives, "luu" and "choo", but dev has one
 * combined Hive by that name; confirmed with the user 2026-10-30). Dry run
 * by default — prints what WOULD be deleted/kept and deletes nothing. Pass
 * --yes to actually delete.
 *
 * Usage:
 *   node src/db/purgeTestHives.js            # dry run
 *   node src/db/purgeTestHives.js --yes       # delete for real
 *
 * Safety: if the database does not have exactly one Hive named "Luu and
 * Chuu", the script stops without deleting anything.
 *
 * The delete plan is NOT hand-maintained. It's discovered at runtime from
 * information_schema — every foreign key (anywhere in the public schema)
 * that points, directly or transitively, at `hives`. That's deliberate:
 * dev currently has a `billing_*`/`hive_monetization` subsystem that
 * production does not, every FK on it is NO ACTION (not cascading), and
 * schema.sql itself keeps growing new hive-dependent tables prompt by
 * prompt. A hand-written table list would either miss billing rows (and
 * the hive DELETE would fail outright with an FK violation on dev) or
 * reference tables that don't exist on production. Walking
 * information_schema instead means the exact same script is correct on
 * both: whatever foreign keys genuinely exist on the target database are
 * exactly what gets deleted, nothing hardcoded, nothing to keep in sync.
 */

import './../env.js';
import { pool, query, getClient } from './index.js';

const YES = process.argv.includes('--yes');

// ── Discover the FK graph reachable from `hives` ─────────────────────────────
// Returns tables in deepest-first delete order, each with the WHERE fragment
// (using $1 = the target hive_ids array) that finds its rows. Pure
// information_schema — works identically whether billing_* exists or not.
async function discoverDeletePlan() {
  const { rows: edges } = await query(
    `SELECT tc.table_name AS child_table, kcu.column_name AS child_column,
            ccu.table_name AS parent_table, ccu.column_name AS parent_column,
            rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
       JOIN information_schema.referential_constraints rc
         ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`,
  );

  // parent_table -> [{ childTable, childColumn, parentColumn, deleteRule }]
  // SET NULL/SET DEFAULT edges are tracked for completeness but never walked:
  // those columns just go NULL natively when the parent is deleted — the row
  // itself isn't "owned" by the Hive (notifications.hive_id is the example
  // this mirrors), so it must survive, not be deleted.
  const childrenOf = new Map();
  for (const e of edges) {
    if (!childrenOf.has(e.parent_table)) childrenOf.set(e.parent_table, []);
    childrenOf.get(e.parent_table).push({
      childTable: e.child_table, childColumn: e.child_column,
      parentColumn: e.parent_column, deleteRule: e.delete_rule,
    });
  }

  // BFS from 'hives' — each table is discovered once, via one edge, which is
  // enough to express "rows belonging to one of the target hive_ids" even if
  // a table (e.g. messages: hive_id direct AND channel_id -> hive_channels)
  // has more than one path back to hives.
  const discoveredVia = new Map(); // table -> { parentTable, childColumn, parentColumn }
  const order = ['hives'];
  const queue = ['hives'];
  while (queue.length) {
    const parent = queue.shift();
    for (const edge of childrenOf.get(parent) ?? []) {
      if (edge.deleteRule === 'SET NULL' || edge.deleteRule === 'SET DEFAULT') continue;
      if (discoveredVia.has(edge.childTable) || edge.childTable === 'hives') continue;
      discoveredVia.set(edge.childTable, { parentTable: parent, childColumn: edge.childColumn, parentColumn: edge.parentColumn });
      order.push(edge.childTable);
      queue.push(edge.childTable);
    }
  }

  // Deepest-first = reverse discovery order, 'hives' itself last.
  const deleteOrder = order.slice(1).reverse().concat(['hives']);

  const whereCache = new Map();
  function whereFor(table) {
    if (table === 'hives') return 'hive_id = ANY($1)';
    if (whereCache.has(table)) return whereCache.get(table);
    const via = discoveredVia.get(table);
    const sql = via.parentTable === 'hives'
      ? `${via.childColumn} = ANY($1)`
      : `${via.childColumn} IN (SELECT ${via.parentColumn} FROM ${via.parentTable} WHERE ${whereFor(via.parentTable)})`;
    whereCache.set(table, sql);
    return sql;
  }

  return deleteOrder.map(table => ({ table, where: whereFor(table) }));
}

// Columns known to hold a Cloudinary (or other external) URL for a Hive's
// media. Never deleted here — Step 9 of the prompt explicitly keeps these
// files in place; this is only for the dry-run report.
async function listExternalFiles(hiveIds) {
  const [{ rows: hiveMedia }, { rows: uploads }, { rows: attachments }] = await Promise.all([
    query(`SELECT hive_id, banner_url, logo_url FROM hives
             WHERE hive_id = ANY($1) AND (banner_url IS NOT NULL OR logo_url IS NOT NULL)`, [hiveIds]),
    query(`SELECT hive_id, url FROM hive_uploads WHERE hive_id = ANY($1)`, [hiveIds]),
    query(
      `SELECT m.hive_id, a.url FROM message_attachments a
         JOIN messages m ON m.message_id = a.message_id
        WHERE m.hive_id = ANY($1)`,
      [hiveIds],
    ),
  ]);
  return { hiveMedia, uploads, attachments };
}

async function run() {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`Target DB host: ${host}`);
  console.log(YES ? 'Mode: DELETE (--yes passed)' : 'Mode: DRY RUN (pass --yes to actually delete)');

  const deletePlan = await discoverDeletePlan();
  console.log(`\nDiscovered ${deletePlan.length} tables transitively owned by hives (deepest-first):`);
  console.log('  ' + deletePlan.map(p => p.table).join(', '));

  // ── Safety check: exactly one "Luu and Chuu" ─────────────────────────────
  // The spec names this fixture as two separate Hives ("luu", "choo"); dev
  // actually has one combined Hive, "Luu and Chuu" (confirmed with the user
  // 2026-10-30) — the same one CLAUDE.md's hiveChannels.js worked example
  // references. Matching on that single real name, not the two from the spec.
  const { rows: fixtures } = await query(
    `SELECT hive_id, hive_name FROM hives WHERE lower(trim(hive_name)) = 'luu and chuu'`,
  );
  if (fixtures.length !== 1) {
    console.error('✗ Safety check failed — expected exactly one "Luu and Chuu".');
    console.error(`  Found ${fixtures.length}:`, fixtures);
    process.exit(1);
  }
  console.log(`\nFixture check OK — Luu and Chuu: ${fixtures[0].hive_id}`);

  const keepIds = new Set([fixtures[0].hive_id]);
  const { rows: seedHives } = await query(`SELECT hive_id FROM hives WHERE is_seed = TRUE`);
  for (const h of seedHives) keepIds.add(h.hive_id);

  const { rows: allHives } = await query(
    `SELECT h.hive_id, h.hive_name, c.category_name,
            (SELECT p.full_name FROM hive_members hm JOIN profiles p ON p.user_id = hm.user_id
              WHERE hm.hive_id = h.hive_id AND hm.role = 'owner' AND hm.membership_status = 'active' LIMIT 1) AS owner_name,
            (SELECT COUNT(*)::int FROM hive_members WHERE hive_id = h.hive_id AND membership_status = 'active') AS member_count,
            (SELECT COUNT(*)::int FROM hive_posts WHERE hive_id = h.hive_id) AS post_count
       FROM hives h LEFT JOIN categories c ON c.category_id = h.category_id
      ORDER BY h.hive_name`,
  );

  const toDelete = allHives.filter(h => !keepIds.has(h.hive_id));
  const toKeep   = allHives.filter(h => keepIds.has(h.hive_id));

  console.log(`\n── Hives to DELETE (${toDelete.length}) ──`);
  for (const h of toDelete) {
    console.log(`  ${h.hive_id}  "${h.hive_name}"  [${h.category_name ?? 'no category'}]  owner=${h.owner_name ?? 'none'}  members=${h.member_count}  posts=${h.post_count}`);
  }

  console.log(`\n── Hives to KEEP (${toKeep.length}) ──`);
  for (const h of toKeep) {
    console.log(`  ${h.hive_id}  "${h.hive_name}"  [${h.category_name ?? 'no category'}]  owner=${h.owner_name ?? 'none'}  members=${h.member_count}  posts=${h.post_count}`);
  }

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.');
    await pool.end();
    return;
  }

  const deleteIds = toDelete.map(h => h.hive_id);

  // Dry-run per-table counts — run every table's own SELECT COUNT, not just
  // print the plan, so the report reflects what's actually there right now.
  console.log(`\n── Rows that would be deleted, per table ──`);
  const dryCounts = {};
  for (const { table, where } of deletePlan) {
    const { rows: [{ n }] } = await query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, [deleteIds]);
    dryCounts[table] = n;
    if (n > 0) console.log(`  ${table}: ${n}`);
  }

  const { hiveMedia, uploads, attachments } = await listExternalFiles(deleteIds);
  console.log(`\n── External files NOT deleted (left in place, per spec) ──`);
  console.log(`  Hive banner/logo URLs: ${hiveMedia.length}`);
  console.log(`  hive_uploads rows: ${uploads.length}`);
  console.log(`  message_attachments rows: ${attachments.length}`);
  if (hiveMedia.length)  console.log('  ' + JSON.stringify(hiveMedia));
  if (uploads.length)    console.log('  ' + JSON.stringify(uploads));
  if (attachments.length) console.log(`  (${attachments.length} attachment URLs — omitted from console, see message_attachments table)`);

  if (!YES) {
    console.log('\nDry run only — nothing deleted. Re-run with --yes to delete.');
    await pool.end();
    return;
  }

  console.log(`\nDeleting ${toDelete.length} Hives and all dependent rows …`);
  const client = await getClient();
  const counts = {};
  try {
    await client.query('BEGIN');
    for (const { table, where } of deletePlan) {
      const { rowCount } = await client.query(`DELETE FROM ${table} WHERE ${where}`, [deleteIds]);
      counts[table] = rowCount;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('\nRows deleted per table:');
  for (const [table, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${table}: ${n}`);
  }

  await pool.end();
}

run().catch(err => {
  console.error('[purgeTestHives] failed:', err);
  process.exit(1);
});
