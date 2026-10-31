/**
 * TrueHive — purge old test Hives (Prompt 75, Step 9 + Prompt 77 additions)
 *
 * Deletes every Hive except: the 30 starter Hives (is_seed = true), the
 * "Luu and Chuu" fixture (trimmed, case-insensitive, exact match — the spec
 * names this as two separate Hives, "luu" and "choo", but dev has one
 * combined Hive by that name; confirmed with the user 2026-10-30), and every
 * Hive created or actively owned by the real user found via the Hive named
 * "LA Explorers" (confirmed with the user 2026-10-30 — that Hive's owner,
 * Lauren Como, is a real person, not a test fixture). Dry run by default —
 * prints what WOULD be deleted/kept and deletes nothing. Pass --yes to
 * actually delete.
 *
 * Usage:
 *   node src/db/purgeTestHives.js                                  # dry run
 *   node src/db/purgeTestHives.js --yes                             # delete for real
 *   node src/db/purgeTestHives.js --delete-user=<uuid>               # + dry-run that user's own data
 *   node src/db/purgeTestHives.js --delete-user=<uuid> --yes         # + actually delete that user, same transaction
 *
 * Safety:
 *   - If the database does not have exactly one Hive named "Luu and Chuu",
 *     the script stops without deleting anything.
 *   - If the database does not have exactly one Hive named "LA Explorers",
 *     or that Hive has no creator, the script stops without deleting
 *     anything — this is the anchor used to find Lauren Como's user id, so
 *     an unresolvable anchor means we can't be sure which Hives are hers.
 *   - --delete-user refuses a user who is_system = true, who is the creator
 *     of "Luu and Chuu", or who is creator_user_id of any Hive NOT already
 *     in this run's delete list (deleting a user must never silently take
 *     an entire other Hive down with it — if that guard trips, resolve it
 *     by hand first).
 *
 * The delete plan is NOT hand-maintained. It's discovered at runtime from
 * information_schema — every foreign key (anywhere in the public schema)
 * that points, directly or transitively, at the given root table. That's
 * deliberate: dev currently has a `billing_*`/`hive_monetization` subsystem
 * that production does not, every FK on it is NO ACTION (not cascading),
 * and schema.sql itself keeps growing new dependent tables prompt by
 * prompt. A hand-written table list would either miss rows (and the DELETE
 * would fail outright with an FK violation on dev) or reference tables
 * that don't exist on production. Walking information_schema instead means
 * the exact same script is correct on both: whatever foreign keys genuinely
 * exist on the target database are exactly what gets deleted, nothing
 * hardcoded, nothing to keep in sync. The same walker is used for both the
 * Hive purge (rooted at hives.hive_id) and --delete-user (rooted at
 * users.user_id) — only the root differs.
 */

import './../env.js';
import { pool, query, getClient } from './index.js';

const YES = process.argv.includes('--yes');
const DELETE_USER_ARG = process.argv.find(a => a.startsWith('--delete-user='));
const DELETE_USER_ID = DELETE_USER_ARG ? DELETE_USER_ARG.split('=')[1] : null;

// ── Discover the FK graph reachable from a root table ────────────────────────
// Returns tables in deepest-first delete order, each with the WHERE fragment
// (using $1 = the target id(s), always passed as an array) that finds its
// rows. Pure information_schema — works identically whether billing_*
// exists or not, and regardless of which table is the root.
async function discoverDeletePlan(rootTable, rootColumn) {
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
  // itself isn't "owned" by the root (notifications.actor_user_id is the
  // example this mirrors: someone else's notification survives, just with
  // the actor reference nulled), so it must survive, not be deleted.
  const childrenOf = new Map();
  for (const e of edges) {
    if (!childrenOf.has(e.parent_table)) childrenOf.set(e.parent_table, []);
    childrenOf.get(e.parent_table).push({
      childTable: e.child_table, childColumn: e.child_column,
      parentColumn: e.parent_column, deleteRule: e.delete_rule,
    });
  }

  // BFS from the root — each table is discovered once, via one edge, which
  // is enough to express "rows belonging to one of the target ids" even if
  // a table has more than one path back to the root.
  const discoveredVia = new Map(); // table -> { parentTable, childColumn, parentColumn }
  const order = [rootTable];
  const queue = [rootTable];
  while (queue.length) {
    const parent = queue.shift();
    for (const edge of childrenOf.get(parent) ?? []) {
      if (edge.deleteRule === 'SET NULL' || edge.deleteRule === 'SET DEFAULT') continue;
      if (discoveredVia.has(edge.childTable) || edge.childTable === rootTable) continue;
      discoveredVia.set(edge.childTable, { parentTable: parent, childColumn: edge.childColumn, parentColumn: edge.parentColumn });
      order.push(edge.childTable);
      queue.push(edge.childTable);
    }
  }

  // Deepest-first = reverse discovery order, the root itself last.
  const deleteOrder = order.slice(1).reverse().concat([rootTable]);

  const whereCache = new Map();
  function whereFor(table) {
    if (table === rootTable) return `${rootColumn} = ANY($1)`;
    if (whereCache.has(table)) return whereCache.get(table);
    const via = discoveredVia.get(table);
    const sql = via.parentTable === rootTable
      ? `${via.childColumn} = ANY($1)`
      : `${via.childColumn} IN (SELECT ${via.parentColumn} FROM ${via.parentTable} WHERE ${whereFor(via.parentTable)})`;
    whereCache.set(table, sql);
    return sql;
  }

  return deleteOrder.map(table => ({ table, where: whereFor(table) }));
}

// Runs every table's own SELECT COUNT for a plan and prints the non-zero
// ones — used for both the Hive dry run and the --delete-user dry run.
async function printDryCounts(label, plan, ids) {
  console.log(`\n── ${label} ──`);
  const counts = {};
  for (const { table, where } of plan) {
    const { rows: [{ n }] } = await query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, [ids]);
    counts[table] = n;
    if (n > 0) console.log(`  ${table}: ${n}`);
  }
  return counts;
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

// Finds a Hive by exact (trimmed, case-insensitive) name. Returns null if
// not found; throws if the name is ambiguous (more than one match) — the
// caller decides what "not exactly one" means for its own safety check.
async function findHiveByName(name) {
  const { rows } = await query(
    `SELECT hive_id, hive_name, creator_user_id FROM hives WHERE lower(trim(hive_name)) = lower($1)`,
    [name],
  );
  return rows;
}

async function activeOwnerOf(hiveId) {
  const { rows: [owner] } = await query(
    `SELECT hm.user_id FROM hive_members hm
      WHERE hm.hive_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'
      LIMIT 1`,
    [hiveId],
  );
  return owner?.user_id ?? null;
}

async function run() {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`Target DB host: ${host}`);
  console.log(YES ? 'Mode: DELETE (--yes passed)' : 'Mode: DRY RUN (pass --yes to actually delete)');
  if (DELETE_USER_ID) console.log(`--delete-user: ${DELETE_USER_ID}`);

  const hiveDeletePlan = await discoverDeletePlan('hives', 'hive_id');
  console.log(`\nDiscovered ${hiveDeletePlan.length} tables transitively owned by hives (deepest-first):`);
  console.log('  ' + hiveDeletePlan.map(p => p.table).join(', '));

  // ── Safety check: exactly one "Luu and Chuu" ─────────────────────────────
  // The spec names this fixture as two separate Hives ("luu", "choo"); dev
  // actually has one combined Hive, "Luu and Chuu" (confirmed with the user
  // 2026-10-30) — the same one CLAUDE.md's hiveChannels.js worked example
  // references. Matching on that single real name, not the two from the spec.
  const luuChuuRows = await findHiveByName('luu and chuu');
  if (luuChuuRows.length !== 1) {
    console.error('✗ Safety check failed — expected exactly one "Luu and Chuu".');
    console.error(`  Found ${luuChuuRows.length}:`, luuChuuRows);
    process.exit(1);
  }
  const luuChuu = luuChuuRows[0];
  console.log(`\nFixture check OK — Luu and Chuu: ${luuChuu.hive_id} (creator ${luuChuu.creator_user_id})`);

  // ── Safety check: resolve Lauren Como via "LA Explorers" ─────────────────
  // The real anchor is the Hive's NAME, not a hardcoded hive_id — hive_ids
  // are randomly generated per database, so a specific dev hive_id would
  // never resolve on production. "LA Explorers" is looked up by name on
  // whichever database this runs against.
  const explorersRows = await findHiveByName('LA Explorers');
  if (explorersRows.length !== 1 || !explorersRows[0].creator_user_id) {
    console.error('✗ Safety check failed — expected exactly one "LA Explorers" Hive with a creator.');
    console.error(`  Found ${explorersRows.length}:`, explorersRows);
    process.exit(1);
  }
  const laurenId = explorersRows[0].creator_user_id;
  console.log(`Lauren Como resolved via "LA Explorers" — user_id ${laurenId}`);

  const keepIds = new Set([luuChuu.hive_id]);
  const keepReasons = new Map([[luuChuu.hive_id, '(fixture — Luu and Chuu)']]);

  const { rows: seedHives } = await query(`SELECT hive_id FROM hives WHERE is_seed = TRUE`);
  for (const h of seedHives) { keepIds.add(h.hive_id); keepReasons.set(h.hive_id, '(starter Hive)'); }

  const { rows: laurenHives } = await query(
    `SELECT DISTINCT h.hive_id FROM hives h
      LEFT JOIN hive_members hm ON hm.hive_id = h.hive_id AND hm.user_id = $1 AND hm.role = 'owner' AND hm.membership_status = 'active'
      WHERE h.creator_user_id = $1 OR hm.user_id = $1`,
    [laurenId],
  );
  for (const h of laurenHives) { keepIds.add(h.hive_id); keepReasons.set(h.hive_id, '(real user — Lauren Como)'); }

  // ── Informational: surface Tay Song's user id for --delete-user ──────────
  const homesForAllRows = await findHiveByName('Homes for all');
  let tayId = null;
  if (homesForAllRows.length === 1) {
    tayId = await activeOwnerOf(homesForAllRows[0].hive_id) ?? homesForAllRows[0].creator_user_id;
    console.log(`\nTay Song candidate (owner of "Homes for all"): ${tayId}`);
    console.log(`  Pass --delete-user=${tayId} to also purge their account in this same run.`);
  } else {
    console.log(`\nTay Song candidate: "Homes for all" not found (${homesForAllRows.length} matches) — nothing to suggest.`);
  }

  // ── --delete-user validation (fails fast, before touching anything) ──────
  let userDeletePlan = null;
  if (DELETE_USER_ID) {
    const { rows: [targetUser] } = await query(
      `SELECT user_id, email, is_system FROM users WHERE user_id = $1`,
      [DELETE_USER_ID],
    );
    if (!targetUser) {
      console.error(`✗ --delete-user: no user with id ${DELETE_USER_ID}.`);
      process.exit(1);
    }
    if (targetUser.is_system) {
      console.error(`✗ --delete-user: refusing — ${DELETE_USER_ID} is_system = true.`);
      process.exit(1);
    }
    if (targetUser.user_id === luuChuu.creator_user_id) {
      console.error(`✗ --delete-user: refusing — ${DELETE_USER_ID} is the creator of "Luu and Chuu".`);
      process.exit(1);
    }
    // A user-delete must never take an entire OTHER Hive down with it via
    // creator_user_id. Every Hive they created must already be in this
    // run's Hive-delete set (computed below) — checked again after that
    // set exists; for now, check against "every Hive they created at all".
    const { rows: ownedHives } = await query(
      `SELECT hive_id, hive_name FROM hives WHERE creator_user_id = $1`,
      [targetUser.user_id],
    );
    const ownedOutsideDeleteSet = ownedHives.filter(h => keepIds.has(h.hive_id));
    if (ownedOutsideDeleteSet.length > 0) {
      console.error(`✗ --delete-user: refusing — ${DELETE_USER_ID} (${targetUser.email}) is creator_user_id of ${ownedOutsideDeleteSet.length} Hive(s) that are being KEPT:`);
      for (const h of ownedOutsideDeleteSet) console.error(`    ${h.hive_id}  "${h.hive_name}"`);
      console.error('  Resolve this by hand (reassign the Hive\'s creator, or keep the user) before retrying.');
      process.exit(1);
    }
    console.log(`\n--delete-user target OK: ${targetUser.email} (${targetUser.user_id})`);
    userDeletePlan = await discoverDeletePlan('users', 'user_id');
    console.log(`Discovered ${userDeletePlan.length} tables transitively owned by users (deepest-first):`);
    console.log('  ' + userDeletePlan.map(p => p.table).join(', '));
  }
  // = ANY($1) in every WHERE fragment expects $1 to be an array — always a
  // one-element array here, same shape as deleteIds below, never the bare
  // DELETE_USER_ID string.
  const userIds = DELETE_USER_ID ? [DELETE_USER_ID] : null;

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
    const reason = keepReasons.get(h.hive_id) ?? '';
    console.log(`  ${h.hive_id}  "${h.hive_name}"  [${h.category_name ?? 'no category'}]  owner=${h.owner_name ?? 'none'}  members=${h.member_count}  posts=${h.post_count}  ${reason}`);
  }

  if (toDelete.length === 0 && !userDeletePlan) {
    console.log('\nNothing to delete.');
    await pool.end();
    return;
  }

  const deleteIds = toDelete.map(h => h.hive_id);

  if (deleteIds.length) {
    await printDryCounts('Hive purge — rows that would be deleted, per table', hiveDeletePlan, deleteIds);

    const { hiveMedia, uploads, attachments } = await listExternalFiles(deleteIds);
    console.log(`\n── External files NOT deleted (left in place, per spec) ──`);
    console.log(`  Hive banner/logo URLs: ${hiveMedia.length}`);
    console.log(`  hive_uploads rows: ${uploads.length}`);
    console.log(`  message_attachments rows: ${attachments.length}`);
    if (hiveMedia.length)  console.log('  ' + JSON.stringify(hiveMedia));
    if (uploads.length)    console.log('  ' + JSON.stringify(uploads));
    if (attachments.length) console.log(`  (${attachments.length} attachment URLs — omitted from console, see message_attachments table)`);
  }

  if (userDeletePlan) {
    await printDryCounts(`--delete-user ${DELETE_USER_ID} — rows that would be deleted, per table`, userDeletePlan, userIds);
  }

  if (!YES) {
    console.log('\nDry run only — nothing deleted. Re-run with --yes to delete.');
    await pool.end();
    return;
  }

  console.log(`\nDeleting ${toDelete.length} Hives${userDeletePlan ? ` and user ${DELETE_USER_ID}` : ''} …`);
  const client = await getClient();
  const counts = {};
  try {
    await client.query('BEGIN');
    if (deleteIds.length) {
      for (const { table, where } of hiveDeletePlan) {
        const { rowCount } = await client.query(`DELETE FROM ${table} WHERE ${where}`, [deleteIds]);
        counts[table] = (counts[table] ?? 0) + rowCount;
      }
    }
    if (userDeletePlan) {
      // Runs after the Hive purge above, in the same transaction — by the
      // time this executes, "Homes for all" (if it was Tay's) is already
      // gone, so hives.creator_user_id no longer blocks deleting the user.
      for (const { table, where } of userDeletePlan) {
        const { rowCount } = await client.query(`DELETE FROM ${table} WHERE ${where}`, [userIds]);
        counts[table] = (counts[table] ?? 0) + rowCount;
      }
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
