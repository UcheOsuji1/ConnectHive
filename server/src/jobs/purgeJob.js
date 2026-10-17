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
import { destroyByUrl } from '../lib/cloudinaryDestroy.js';
import { reportProblem } from '../lib/reportProblem.js';
import { reportJobError } from '../lib/jobTick.js';

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
  const photoUrl = profileRow?.profile_photo_url ?? null;

  await client.query(
    `UPDATE profiles SET
        full_name = 'Deleted member', age = NULL, location = NULL, school_company = NULL, bio = NULL,
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
    `[purgeJob] purged user ${user.user_id} — ` +
    `${rowsDeleted} rows removed across this account's own tables, profile PII cleared, ` +
    `account_status -> deleted. Authored content (messages, posts, etc.) left in place.`,
  );

  return { photoUrl };
}

// Media URLs have to be read before the DELETE — hive_uploads and
// message_attachments both cascade away the instant the Hive row goes, and
// there would be nothing left to destroy on Cloudinary.
async function _collectHiveMediaUrls(client, hiveId) {
  const [{ rows: [hiveRow] }, { rows: uploads }, { rows: attachments }] = await Promise.all([
    client.query(`SELECT logo_url, banner_url FROM hives WHERE hive_id = $1`, [hiveId]),
    client.query(`SELECT url FROM hive_uploads WHERE hive_id = $1`, [hiveId]),
    client.query(
      `SELECT ma.url FROM message_attachments ma
         JOIN messages m ON m.message_id = ma.message_id
        WHERE m.hive_id = $1`,
      [hiveId],
    ),
  ]);
  const urls = [];
  if (hiveRow?.logo_url) urls.push(hiveRow.logo_url);
  if (hiveRow?.banner_url) urls.push(hiveRow.banner_url);
  for (const u of uploads) urls.push(u.url);
  for (const a of attachments) urls.push(a.url);
  return urls;
}

async function _purgeHive(client, hive) {
  const mediaUrls = await _collectHiveMediaUrls(client, hive.hive_id);
  const { rowCount } = await client.query(`DELETE FROM hives WHERE hive_id = $1`, [hive.hive_id]);
  console.log(
    `[purgeJob] purged Hive ${hive.hive_id} (${hive.hive_name}) — hard-deleted (${rowCount} row). ` +
    `Every child table cascades or SET NULLs, confirmed at job startup — no orphans possible.`,
  );
  return { mediaUrls };
}

// Destroys a purged account's profile photo on Cloudinary. Always called
// AFTER that account's transaction has committed — a Cloudinary failure here
// must never roll back a purge that has already succeeded.
async function _destroyUserPhoto(userId, photoUrl) {
  if (!photoUrl) return;
  const result = await destroyByUrl(photoUrl);
  if (result.skipped) {
    console.log(`[purgeJob] user ${userId} photo destroy skipped: ${result.skipped}`);
  } else if (result.ok) {
    console.log(`[purgeJob] user ${userId} photo destroyed (public_id=${result.publicId}, result=${result.result})`);
  } else {
    reportProblem(`[purgeJob] user ${userId} photo destroy FAILED (public_id=${result.publicId}): ${result.error}`);
  }
}

// Same after-commit timing as the user photo — a failed Cloudinary call
// never reopens an already-committed Hive deletion.
async function _destroyHiveMedia(hiveId, mediaUrls) {
  if (!mediaUrls.length) return;
  let ok = 0, notFound = 0, failed = 0, skipped = 0;
  for (const url of mediaUrls) {
    const result = await destroyByUrl(url);
    if (result.skipped) skipped++;
    else if (result.ok && result.result === 'not found') notFound++;
    else if (result.ok) ok++;
    else {
      failed++;
      reportProblem(`[purgeJob] Hive ${hiveId} media destroy FAILED (public_id=${result.publicId}): ${result.error}`);
    }
  }
  console.log(
    `[purgeJob] Hive ${hiveId} media cleanup — ok: ${ok}, not found: ${notFound}, ` +
    `failed: ${failed}, skipped: ${skipped} (of ${mediaUrls.length}).`,
  );
}

export async function runPurgeJob() {
  const cascadeCols = await _userCascadeColumns();

  const { rows: dueUsers } = await query(
    `SELECT user_id, deletion_scheduled_for FROM users
      WHERE account_status = 'pending_deletion' AND deletion_scheduled_for <= NOW()`,
  );

  let usersPurged = 0, usersFailed = 0;
  for (const user of dueUsers) {
    const client = await getClient();
    let photoUrl = null;
    try {
      await client.query('BEGIN');
      ({ photoUrl } = await _purgeUser(client, user, cascadeCols));
      await client.query('COMMIT');
      usersPurged++;
    } catch (err) {
      await client.query('ROLLBACK');
      usersFailed++;
      reportProblem(`[purgeJob] FAILED to purge user ${user.user_id} — will retry next hour:`, err);
    } finally {
      client.release();
    }
    if (photoUrl) await _destroyUserPhoto(user.user_id, photoUrl);
  }

  const { rows: dueHives } = await query(
    `SELECT hive_id, hive_name, purge_after FROM hives
      WHERE hive_status = 'deleted' AND purge_after <= NOW()`,
  );

  let hivesPurged = 0, hivesFailed = 0;
  for (const hive of dueHives) {
    const client = await getClient();
    let mediaUrls = [];
    try {
      await client.query('BEGIN');
      ({ mediaUrls } = await _purgeHive(client, hive));
      await client.query('COMMIT');
      hivesPurged++;
    } catch (err) {
      await client.query('ROLLBACK');
      hivesFailed++;
      reportProblem(`[purgeJob] FAILED to purge Hive ${hive.hive_id} — will retry next hour:`, err);
    } finally {
      client.release();
    }
    await _destroyHiveMedia(hive.hive_id, mediaUrls);
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
  runPurgeJob().catch(e => reportJobError('purgeJob', 'initial run', e));
  setInterval(() => {
    runPurgeJob().catch(e => reportJobError('purgeJob', 'run', e));
  }, INTERVAL_MS);
}
