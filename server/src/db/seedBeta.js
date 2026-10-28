/**
 * TrueHive — pre-beta QA world (Prompt 74 Step 1)
 *
 * Usage: node src/db/seedBeta.js
 *
 * Builds a small, realistic world for the Playwright walkthrough in
 * client/tests/prebeta/. Every row is prefixed `qa-` (emails) or tagged with
 * a `qa-` hive name, so cleanup is exact and this never touches real data.
 * Re-runnable: deletes every qa- row first, then rebuilds from scratch.
 *
 * Refuses to run against production — mirrors the Step 0 host check.
 */
import './../env.js';
import bcrypt from 'bcryptjs';
import { pool, query, getClient } from './index.js';
import { createPairChannel } from '../lib/hiveChannels.js';
import { resolveMetro } from '../lib/metros.js';

const PROD_HOST_PREFIX = 'ep-wild-frog-at0sgrd0-pooler';
const dbUrl = new URL(process.env.DATABASE_URL);
if (dbUrl.hostname.startsWith(PROD_HOST_PREFIX)) {
  console.error('✗ Refusing to seed — DATABASE_URL host looks like production:', dbUrl.hostname);
  process.exit(1);
}

const QA_DOMAIN   = '@qa.truehive.test';
const QA_PASSWORD = 'QaBeta2026!';

async function q(text, params) { const { rows } = await pool.query(text, params); return rows; }

function nextSaturday(hour = 11) {
  const d = new Date();
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function plusDays(base, days) { const d = new Date(base); d.setDate(d.getDate() + days); return d; }
function minutesAgo(n) { return new Date(Date.now() - n * 60_000); }

// ── Users ───────────────────────────────────────────────────────────────────
// 8 LA-area users (ages 19–45, mixed profile completeness/verification) + 1 Miami.
const USERS = [
  { key: 'owner1',   email: 'qa-owner1@qa.truehive.test',   verified: true,  age: 24, full: true,
    full_name: 'Maya Sutton',    location: 'Silver Lake, Los Angeles, CA' },
  { key: 'owner2',   email: 'qa-owner2@qa.truehive.test',   verified: true,  age: 35, full: true,
    full_name: 'Carlos Rivera',  location: 'Downtown Los Angeles, CA' },
  { key: 'owner3',   email: 'qa-owner3@qa.truehive.test',   verified: true,  age: 29, full: true,
    full_name: 'Priya Anand',    location: 'Los Angeles, CA' },
  { key: 'owner4',   email: 'qa-owner4@qa.truehive.test',   verified: true,  age: 31, full: true,
    full_name: 'Derek Okoye',    location: 'Los Angeles, CA' },
  { key: 'member1',  email: 'qa-member1@qa.truehive.test',  verified: true,  age: 26, full: true,
    full_name: 'Lena Fischer',   location: 'Echo Park, Los Angeles, CA' },
  { key: 'member2',  email: 'qa-member2@qa.truehive.test',  verified: false, age: 22, full: true,
    full_name: 'Jamal Price',    location: 'Los Angeles, CA' },
  { key: 'unfinished', email: 'qa-unfinished@qa.truehive.test', verified: true, age: 41, full: false,
    full_name: 'Ravi Shah',      location: 'Los Angeles, CA' },
  { key: 'googleonly', email: 'qa-googleonly@qa.truehive.test', verified: true, age: 19, full: 'google',
    full_name: 'Sam Whitfield',  location: null },
  { key: 'miami',    email: 'qa-miami@qa.truehive.test',    verified: true,  age: 45, full: true,
    full_name: 'Isabela Cruz',   location: 'Miami, FL' },
];

const INTERESTS = ['☕ Coffee culture', '🥾 Hiking', '🎨 Digital art'];
const SKILLS     = ['🌐 Web Development', '📋 Project Management'];
const GOALS       = ['goals', 'vibes'];
const AVAIL        = ['Weekends', 'Evenings'];
const PURPOSES      = ['social', 'networking'];

async function seedUsers() {
  console.log('\n  Seeding users…');
  const passwordHash = await bcrypt.hash(QA_PASSWORD, 10);
  const idByKey = {};

  for (const u of USERS) {
    const [row] = await q(
      `INSERT INTO users (email, password_hash, account_status, date_of_birth,
                           terms_accepted_at, terms_policy_version, email_verified)
       VALUES ($1,$2,'active',$3, NOW(), 'v2-2026-10', $4)
       RETURNING user_id`,
      [u.email, passwordHash, `${new Date().getFullYear() - u.age}-06-15`, u.verified],
    );
    idByKey[u.key] = row.user_id;

    if (u.full === 'google') {
      // Mirrors googleCallback's real prefill exactly: full_name only.
      await q(`INSERT INTO profiles (user_id, full_name) VALUES ($1,$2)`, [row.user_id, u.full_name]);
    } else if (u.full === false) {
      // Unfinished: name + age only, no location/interests/skills/purposes —
      // fails the funnel's profile_finished condition same as the Google case.
      await q(
        `INSERT INTO profiles (user_id, full_name, age) VALUES ($1,$2,$3)`,
        [row.user_id, u.full_name, u.age],
      );
    } else {
      await q(
        `INSERT INTO profiles
           (user_id, full_name, age, location, bio, interests, skills, goals,
            availability, connection_preference, connection_purposes, group_size_preference)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.user_id, u.full_name, u.age, u.location,
          `QA fixture — ${u.full_name}.`,
          JSON.stringify(INTERESTS), JSON.stringify(SKILLS), JSON.stringify(GOALS),
          JSON.stringify(AVAIL), 'hybrid', JSON.stringify(PURPOSES), 'm',
        ],
      );
    }
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${USERS.length} users (8 LA + 1 Miami)`);
  return idByKey;
}

// ── Hives ───────────────────────────────────────────────────────────────────
const HIVES = [
  {
    key: 'silverlake', hive_name: 'qa-Silver Lake Social', category: 'Social Groups',
    description: 'QA fixture — open in-person Hive in Silver Lake for the pre-beta walkthrough.',
    join_policy: 'open', location_type: 'in-person', location: 'Silver Lake, Los Angeles, CA',
    max_members: 40, ownerKey: 'owner1', adminKeys: [], memberKeys: ['member1', 'member2'],
    // join_experience: 'simple' + join_policy: 'open' together are what
    // actually trigger the "You're in!" notification + E1/E2 queueing on
    // join (hivesController.js's requestToJoin) — confirmed by reading it.
    // Any other join_experience on an open Hive still joins instantly, just
    // silently (no notification, no email).
    joinExperience: 'simple',
  },
  {
    key: 'downtown', hive_name: 'qa-Downtown LA Builders', category: 'Professional Networking',
    description: 'QA fixture — request-approval hybrid Hive with guided onboarding turned on.',
    join_policy: 'request', location_type: 'hybrid', location: 'Downtown Los Angeles, CA',
    max_members: 50, ownerKey: 'owner2', adminKeys: ['owner3'], memberKeys: [],
    onboarding: true, requestKeys: ['unfinished', 'googleonly'],
  },
  {
    key: 'online', hive_name: 'qa-Remote Builders Online', category: 'Project Collaboration',
    description: 'QA fixture — fully online Hive, no location/metro.',
    join_policy: 'open', location_type: 'online', location: null,
    max_members: 60, ownerKey: 'owner3', adminKeys: [], memberKeys: ['member1'],
  },
  {
    key: 'allTools', hive_name: 'qa-Every Tool Hive', category: 'Social Groups',
    description: 'QA fixture — every one of the 13 Hive Tools turned on.',
    join_policy: 'open', location_type: 'in-person', location: 'Los Angeles, CA',
    max_members: 40, ownerKey: 'owner4', adminKeys: [], memberKeys: ['member1', 'member2'],
    allTools: true,
  },
];

const ALL_TOOL_KEYS = [
  'find_time', 'checkins', 'split_costs', 'signups', 'docs', 'goals',
  'coffee_chats', 'mentorship', 'opportunities', 'tasks', 'itinerary', 'rides', 'ideas',
];

async function seedHives(idByKey) {
  console.log('  Seeding hives…');
  const catRows = await q(`SELECT category_id, category_name FROM categories`);
  const catMap  = Object.fromEntries(catRows.map(r => [r.category_name, r.category_id]));
  const hiveIdByKey = {};
  const chanIdByKey = {};

  for (const h of HIVES) {
    const creatorId = idByKey[h.ownerKey];
    // resolveMetro only parses 2-segment "City, ST" strings — a 3-segment
    // "Neighborhood, City, ST" location (same known gap as "Leimert Park Art
    // Walks" from Prompt 71's backfill) resolves to null. These are known LA
    // neighborhoods, so fall back rather than leaving the Hive unmatched by
    // Find Your Hive's LA search.
    const metroKey = h.location
      ? (await resolveMetro(h.location)) ?? (/Los Angeles/i.test(h.location) ? 'los-angeles' : null)
      : null;
    const [row] = await q(
      `INSERT INTO hives
         (creator_user_id, category_id, hive_name, description, join_policy,
          location_type, location, max_members, discoverable, metro_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9)
       RETURNING hive_id`,
      [creatorId, catMap[h.category] ?? null, h.hive_name, h.description, h.join_policy,
       h.location_type, h.location, h.max_members, metroKey],
    );
    hiveIdByKey[h.key] = row.hive_id;

    await q(`INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
              VALUES ($1,$2,'owner','active',NOW())`, [row.hive_id, creatorId]);
    for (const ak of h.adminKeys)
      await q(`INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
                VALUES ($1,$2,'admin','active',NOW())`, [row.hive_id, idByKey[ak]]);
    for (const mk of h.memberKeys)
      await q(`INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at)
                VALUES ($1,$2,'member','active',NOW())`, [row.hive_id, idByKey[mk]]);

    const [chan] = await q(
      `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
       VALUES ($1,'general','text',TRUE,0) RETURNING channel_id`,
      [row.hive_id],
    );
    chanIdByKey[h.key] = chan.channel_id;

    if (h.onboarding) {
      await q(
        `INSERT INTO hive_onboarding_settings (hive_id, join_experience, welcome_message, show_welcome_banner)
         VALUES ($1,'guided','Welcome to Downtown LA Builders — glad you''re here!',TRUE)`,
        [row.hive_id],
      );
    }
    if (h.joinExperience) {
      await q(
        `INSERT INTO hive_onboarding_settings (hive_id, join_experience) VALUES ($1,$2)`,
        [row.hive_id, h.joinExperience],
      );
    }
    if (h.allTools) {
      for (const key of ALL_TOOL_KEYS) {
        await q(
          `INSERT INTO hive_tools (hive_id, tool_key, enabled, updated_by) VALUES ($1,$2,TRUE,$3)`,
          [row.hive_id, key, creatorId],
        );
      }
    }
    for (const rk of h.requestKeys ?? []) {
      await q(
        `INSERT INTO join_requests (hive_id, user_id, status, request_message)
         VALUES ($1,$2,'pending','QA fixture join request — testing the owner Requests page.')`,
        [row.hive_id, idByKey[rk]],
      );
    }
    process.stdout.write('+');
  }
  console.log(`\n  ✓ ${HIVES.length} hives`);
  return { hiveIdByKey, chanIdByKey };
}

// ── Posts, plans, chat, pair chat ──────────────────────────────────────────

async function seedPosts(idByKey, hiveIdByKey) {
  console.log('  Seeding posts and plans…');
  let n = 0;

  // A couple of plain posts
  await q(
    `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body)
     VALUES ($1,$2,'update',$3,$4)`,
    [hiveIdByKey.silverlake, idByKey.owner1, 'Welcome to the Hive!',
     'QA fixture post — glad to have everyone here for the pre-beta walkthrough.'],
  ); n++;
  await q(
    `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body)
     VALUES ($1,$2,'update',$3,$4)`,
    [hiveIdByKey.online, idByKey.owner3, 'Kickoff thread',
     'QA fixture post for the Remote Builders Online Hive.'],
  ); n++;

  // A plan next Saturday
  const sat = nextSaturday(11);
  const [planPost] = await q(
    `INSERT INTO hive_posts (hive_id, author_user_id, post_type, headline, body, event_at, event_location)
     VALUES ($1,$2,'event',$3,$4,$5,$6) RETURNING post_id`,
    [hiveIdByKey.silverlake, idByKey.owner1, 'Saturday meetup',
     'QA fixture plan — Saturday hangout for the walkthrough.', sat.toISOString(), 'Silver Lake Reservoir'],
  ); n++;
  await q(`INSERT INTO event_rsvps (post_id, user_id, rsvp_status) VALUES ($1,$2,'going')`,
    [planPost.post_id, idByKey.member1]);
  await q(`INSERT INTO event_rsvps (post_id, user_id, rsvp_status) VALUES ($1,$2,'maybe')`,
    [planPost.post_id, idByKey.member2]);

  // A recurring plan — 3 weekly occurrences
  const [series] = await q(
    `INSERT INTO hive_plan_series (hive_id, created_by, rule, count)
     VALUES ($1,$2,'weekly',3) RETURNING series_id`,
    [hiveIdByKey.downtown, idByKey.owner2],
  );
  for (let i = 0; i < 3; i++) {
    const occAt = plusDays(sat, i * 7);
    await q(
      `INSERT INTO hive_posts
         (hive_id, author_user_id, post_type, headline, body, event_at, event_location, series_id, series_index)
       VALUES ($1,$2,'event',$3,$4,$5,$6,$7,$8)`,
      [hiveIdByKey.downtown, idByKey.owner2, 'Weekly builder standup',
       'QA fixture recurring plan.', occAt.toISOString(), 'Downtown LA — co-working space', series.series_id, i],
    ); n++;
  }
  console.log(`  ✓ ${n} posts/plans`);
}

async function seedChat(idByKey, hiveIdByKey, chanIdByKey) {
  console.log('  Seeding chat history…');
  let n = 0;
  const threads = [
    { chanKey: 'silverlake', lines: [
      ['owner1',  "Hey everyone, welcome to Silver Lake Social! QA fixture thread."],
      ['member1', "Excited to be here — QA fixture reply."],
      ['member2', "Same! Looking forward to the Saturday meetup."],
    ] },
    { chanKey: 'downtown', lines: [
      ['owner2', "Welcome to Downtown LA Builders. QA fixture thread for chat testing."],
      ['owner3', "Glad to help run this one with you."],
    ] },
  ];
  for (const t of threads) {
    const chanId = chanIdByKey[t.chanKey];
    const hiveId = hiveIdByKey[t.chanKey];
    for (let i = 0; i < t.lines.length; i++) {
      const [userKey, text] = t.lines[i];
      await q(
        `INSERT INTO messages (hive_id, sender_user_id, message_text, sent_at, channel_id)
         VALUES ($1,$2,$3,$4,$5)`,
        [hiveId, idByKey[userKey], text, minutesAgo((t.lines.length - i) * 3).toISOString(), chanId],
      );
      n++;
    }
  }
  console.log(`  ✓ ${n} chat messages in 2 rooms`);
}

async function seedPairChat(idByKey, hiveIdByKey) {
  console.log('  Seeding one private pair chat…');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const channelId = await createPairChannel(
      client, hiveIdByKey.silverlake, [idByKey.owner1, idByKey.member1], 'coffee_chat',
    );
    if (channelId) {
      await client.query(
        `INSERT INTO messages (hive_id, sender_user_id, message_text, channel_id)
         VALUES ($1,$2,$3,$4)`,
        [hiveIdByKey.silverlake, idByKey.owner1, 'QA fixture pair chat — hi!', channelId],
      );
    }
    await client.query('COMMIT');
    console.log(channelId ? '  ✓ 1 pair chat' : '  ✗ pair chat skipped (blocked pair?)');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log('\n  Cleaning up previous qa- rows…');
  await q(`DELETE FROM event_rsvps WHERE post_id IN (SELECT post_id FROM hive_posts WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%'))`);
  await q(`DELETE FROM hive_posts WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM hive_plan_series WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM message_reactions WHERE message_id IN (SELECT message_id FROM messages WHERE sender_user_id IN (SELECT user_id FROM users WHERE email LIKE $1))`, [`%${QA_DOMAIN}`]);
  await q(`DELETE FROM messages WHERE sender_user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${QA_DOMAIN}`]);
  await q(`DELETE FROM hive_channel_members WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${QA_DOMAIN}`]);
  await q(`DELETE FROM hive_channels WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM join_requests WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM hive_onboarding_settings WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM hive_tools WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM hive_members WHERE hive_id IN (SELECT hive_id FROM hives WHERE hive_name LIKE 'qa-%')`);
  await q(`DELETE FROM hives WHERE hive_name LIKE 'qa-%'`);
  // reports.hive_id is nullable (a person/profile report has no Hive
  // context) and CASCADEs on the Hive, but reports.resolved_by is a
  // plain NO ACTION fk straight to users — a hiveless report a qa- admin
  // resolved (Flow 11) survives the hives delete above and then blocks
  // deleting that admin below. Delete every report touching a qa- user in
  // any of its three user columns before deleting users, not just the
  // ones a Hive's own cascade happens to reach.
  await q(
    `DELETE FROM reports WHERE reporter_id IN (SELECT user_id FROM users WHERE email LIKE $1)
        OR target_user_id IN (SELECT user_id FROM users WHERE email LIKE $1)
        OR resolved_by    IN (SELECT user_id FROM users WHERE email LIKE $1)`,
    [`%${QA_DOMAIN}`],
  );
  await q(`DELETE FROM profiles WHERE user_id IN (SELECT user_id FROM users WHERE email LIKE $1)`, [`%${QA_DOMAIN}`]);
  await q(`DELETE FROM users WHERE email LIKE $1`, [`%${QA_DOMAIN}`]);
  console.log('  ✓ cleanup complete');
}

async function main() {
  console.log('────────────────────────────────────────────────────────────');
  console.log('  TrueHive — pre-beta QA world (seedBeta.js)');
  console.log('  host:', dbUrl.hostname);
  console.log('────────────────────────────────────────────────────────────');

  await cleanup();
  const idByKey = await seedUsers();
  const { hiveIdByKey, chanIdByKey } = await seedHives(idByKey);
  await seedPosts(idByKey, hiveIdByKey);
  await seedChat(idByKey, hiveIdByKey, chanIdByKey);
  await seedPairChat(idByKey, hiveIdByKey);

  console.log('\n────────────────────────────────────────────────────────────');
  console.log('  Done. Summary:');
  console.log('  Users:', Object.keys(idByKey).length, '(password for all:', QA_PASSWORD + ')');
  console.log('  Hives:', Object.keys(hiveIdByKey).length);
  console.log('  Login any qa- user with their email + the password above.');
  console.log('────────────────────────────────────────────────────────────');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
