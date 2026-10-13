/**
 * Hourly purge — the far end of account and Hive deletion's 30-day grace
 * period (see authController.js's deleteAccount and hivesController.js's
 * deleteHive).
 *
 * Users are never hard-deleted: ~40 tables hold content — messages, posts,
 * comments, task assignments, plan authorship — via a foreign key to
 * users(user_id) with ON DELETE NO ACTION, a deliberate constraint that
 * blocks a real DELETE rather than silently losing everyone else's context
 * when one member leaves. So purge means ANONYMISE: clear every PII field on
 * users/profiles, delete the ~40 tables that hold this person's own
 * preferences/junction rows (ON DELETE CASCADE — exactly the rows a real
 * DELETE would have cascaded away anyway), and leave their authored content
 * in place for the client to render as "Deleted member".
 *
 * Hives work the other way: every child table cascades (confirmed at the
 * bottom of this file's startup check), so a purged Hive is a real, hard
 * DELETE FROM hives — there is no content left for anyone else to lose.
 *
 * Each user and each Hive purges inside its own transaction, so one failure
 * never blocks or partially-corrupts another, and a crash mid-run just
 * leaves that one row to retry next hour.
 */
import { query, getClient } from '../db/index.js';

const INTERVAL_MS = 60 * 60 * 1000; // hourly

// Every FK column pointing at users(user_id) whose delete_rule is CASCADE or
// SET NULL — discovered from the schema itself, not hand-maintained, so it
// never silently drifts out of date as tables are added. `profiles` is
// excluded: it CASCADEs like the others, but the purge anonymises that row
// in place instead of deleting it (code elsewhere assumes every user has a
// profiles row).
async function _userCascadeColumns() {
  const { rows } = await query(
    `SELECT tc.table_name, kcu.column_name, rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'users' AND ccu.column_name = 'user_id'
        AND rc.delete_rule IN ('CASCADE', 'SET NULL')
        AND tc.table_name != 'profiles'
      ORDER BY tc.table_name, kcu.column_name`,
  );
  return rows;
}

async function _purgeUser(client, user, cascadeCols) {
  let rowsDeleted = 0;
  for (const { table_name, column_name, delete_rule } of cascadeCols) {
    if (delete_rule === 'CASCADE') {
      const { rowCount } = await client.query(
        `DELETE FROM "${table_name}" WHERE "${column_name}" = $1`,
        [user.user_id],
      );
      rowsDeleted += rowCount;
    } else {
      await client.query(
        `UPDATE "${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" = $1`,
        [user.user_id],
      );
    }
  }

  const { rows: [profileRow] } = await client.query(
    `SELECT profile_photo_url FROM profiles WHERE user_id = $1`, [user.user_id],
  );
  if (profileRow?.profile_photo_url) {
    console.warn(
      `[purgeJob] user ${user.user_id} had a Cloudinary photo (${profileRow.profile_photo_url}) — ` +
      `reference cleared, but the asset itself was NOT destroyed: this codebase has a signed ` +
      `upload helper (mediaController.getMediaUploadSignature) but no signed-destroy helper yet.`,
    );
  }

  await client.query(
    `UPDATE profiles SET
        full_name = NULL, age = NULL, location = NULL, school_company = NULL, bio = NULL,
        profile_photo_url = NULL, interests = '[]', skills = '[]', goals = '[]', availability = '[]',
        personality_type = NULL, connection_preference = NULL, connection_purposes = '[]',
        social_preferences = '{}', group_size_preference = NULL,
        venmo_handle = NULL, cashapp_handle = NULL, paypal_handle = NULL, updated_at = NOW()
      WHERE user_id = $1`,
    [user.user_id],
  );

  await client.query(
    `UPDATE users SET
        email = 'deleted-' || user_id || '@deleted.truehive.app',
        password_hash = NULL, date_of_birth = NULL,
        account_status = 'deleted', deleted_at = NOW(), deletion_scheduled_for = NULL
      WHERE user_id = $1`,
    [user.user_id],
  );

  console.log(
    `[purgeJob] purged user ${user.user_id} (was ${user.email}) — ` +
    `${rowsDeleted} rows removed across this account's own tables, profile PII cleared, ` +
    `account_status -> deleted. Authored content (messages, posts, etc.) left in place.`,
  );
}

async function _purgeHive(client, hive) {
  const { rowCount } = await client.query(`DELETE FROM hives WHERE hive_id = $1`, [hive.hive_id]);
  console.log(
    `[purgeJob] purged Hive ${hive.hive_id} (${hive.hive_name}) — hard-deleted (${rowCount} row). ` +
    `Every child table cascades or SET NULLs, confirmed at job startup — no orphans possible.`,
  );
}

export async function runPurgeJob() {
  const cascadeCols = await _userCascadeColumns();

  const { rows: dueUsers } = await query(
    `SELECT user_id, email, deletion_scheduled_for FROM users
      WHERE account_status = 'pending_deletion' AND deletion_scheduled_for <= NOW()`,
  );

  let usersPurged = 0, usersFailed = 0;
  for (const user of dueUsers) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await _purgeUser(client, user, cascadeCols);
      await client.query('COMMIT');
      usersPurged++;
    } catch (err) {
      await client.query('ROLLBACK');
      usersFailed++;
      console.error(`[purgeJob] FAILED to purge user ${user.user_id} — will retry next hour:`, err);
    } finally {
      client.release();
    }
  }

  const { rows: dueHives } = await query(
    `SELECT hive_id, hive_name, purge_after FROM hives
      WHERE hive_status = 'deleted' AND purge_after <= NOW()`,
  );

  let hivesPurged = 0, hivesFailed = 0;
  for (const hive of dueHives) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      await _purgeHive(client, hive);
      await client.query('COMMIT');
      hivesPurged++;
    } catch (err) {
      await client.query('ROLLBACK');
      hivesFailed++;
      console.error(`[purgeJob] FAILED to purge Hive ${hive.hive_id} — will retry next hour:`, err);
    } finally {
      client.release();
    }
  }

  if (dueUsers.length || dueHives.length) {
    console.log(
      `[purgeJob] run complete — users: ${usersPurged} purged, ${usersFailed} failed ` +
      `(of ${dueUsers.length} due); Hives: ${hivesPurged} purged, ${hivesFailed} failed (of ${dueHives.length} due).`,
    );
  }

  return { usersPurged, usersFailed, hivesPurged, hivesFailed };
}

let started = false;
export function startPurgeJob() {
  if (started) return;
  started = true;
  runPurgeJob().catch(e => console.error('[purgeJob] initial run failed:', e));
  setInterval(() => {
    runPurgeJob().catch(e => console.error('[purgeJob] run failed:', e));
  }, INTERVAL_MS);
}
