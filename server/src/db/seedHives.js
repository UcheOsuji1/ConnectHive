/**
 * TrueHive — starter Hives seed script (Prompt 75)
 *
 * Seeds 30 "starter" Hives (5 per category), each owned by a house account
 * ("TrueHive Team", is_system = true) so Discovery never looks empty at
 * launch. Idempotent: matched on (hive_name, is_seed = true) — running this
 * twice leaves exactly 30 seed Hives, not 60.
 *
 * Usage:
 *   node src/db/seedHives.js            # dev / any non-production DB
 *   node src/db/seedHives.js --yes      # required if NODE_ENV=production
 */

import './../env.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool, query, getClient } from './index.js';
import { resolveLocationMetro } from '../lib/metros.js';

const YES = process.argv.includes('--yes');
const SEED_OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'team@truehive.app';
const SALT_ROUNDS = 10; // matches authController.js's SALT_ROUNDS

// Every starter Hive gets this plan-creation mode regardless of its
// category's own createHive default (categoryConfig.js) — decision made in
// the Prompt 75 spec: members propose, the whole Hive votes.
const SEED_PLAN_RULES = { plan_proposers: 'members', plan_approval: 'vote' };

const SEED_HIVES = [
  // ── Social Groups ──────────────────────────────────────────────────────
  { name: 'New in LA — Westside Weekend Crew', category: 'Social Groups', location: 'Santa Monica, CA',
    description: 'For people in their 20s who just moved to LA and want a crew for brunch spots, beach days, and trivia nights.',
    tags: ['brunch', 'beach', 'trivia', 'nightlife'] },
  { name: 'Laptop Lunch Club', category: 'Social Groups', location: 'Silver Lake, CA',
    description: 'Remote workers tired of working alone. We pick a café each week, work side by side, and grab lunch together.',
    tags: ['remote work', 'coffee', 'coworking'] },
  { name: 'Chapter & Verse', category: 'Social Groups', location: 'Los Angeles, CA',
    description: "A book club that actually finishes the book. One book a month, members vote on picks, and meetups rotate between members' homes.",
    tags: ['books', 'reading', 'discussion'] },
  { name: 'Dads Who Hike', category: 'Social Groups', location: 'Los Angeles, CA',
    description: 'Low-pressure Saturday trail walks for single dads looking to rebuild their social circle.',
    tags: ['hiking', 'outdoors', 'parenting'] },
  { name: 'Post-Grad Game Night', category: 'Social Groups', location: 'Los Angeles, CA',
    description: 'Recent grads whose college friends scattered. Board games and Mario Kart every other Friday.',
    tags: ['board games', 'video games', 'recent grads'] },

  // ── Professional Networking ────────────────────────────────────────────
  { name: 'LA Design Critique Circle', category: 'Professional Networking', location: 'Los Angeles, CA',
    description: 'Designers sharing portfolio work for honest, constructive feedback in a monthly critique session.',
    tags: ['UX design', 'product design', 'portfolio'] },
  { name: 'Black Women Founders LA', category: 'Professional Networking', location: 'Los Angeles, CA',
    description: 'Black women running businesses, sharing vendor contacts, grant leads, and marketing tips.',
    tags: ['entrepreneurship', 'small business', 'marketing'] },
  { name: 'New Grad SWE Accountability', category: 'Professional Networking', location: 'Los Angeles, CA',
    description: 'New grads job hunting in software: weekly LeetCode sessions, mock interviews, and a shared referral board.',
    tags: ['software engineering', 'interviews', 'career'] },
  { name: 'Clinical to Corporate', category: 'Professional Networking', location: 'Los Angeles, CA',
    description: 'Healthcare workers moving from clinical roles into admin, operations, and health tech.',
    tags: ['healthcare', 'career change', 'management'] },
  { name: 'Indie Post-Production Network', category: 'Professional Networking', location: 'Burbank, CA',
    description: 'Freelance editors, colorists, and sound designers referring overflow work to each other.',
    tags: ['video editing', 'film', 'freelancing'] },

  // ── Travel Buddies ──────────────────────────────────────────────────────
  { name: 'Tokyo Cherry Blossom Trip 2027', category: 'Travel Buddies', location: 'Los Angeles, CA',
    description: 'Planning Japan for cherry blossom season in spring 2027. Looking for 3–4 travelers to split lodging and plan the route together.',
    tags: ['Japan', 'travel', 'culture', 'food'] },
  { name: 'Surf Trip Squad — Baja', category: 'Travel Buddies', location: 'Los Angeles, CA',
    description: 'Intermediate surfers driving down to Baja together to share gas, lodging, and waves.',
    tags: ['surfing', 'road trips', 'Mexico'] },
  { name: 'Southeast Asia on $40/Day', category: 'Travel Buddies', location: 'Los Angeles, CA',
    description: 'Budget backpackers planning a 3-week Southeast Asia route with people on a similar budget.',
    tags: ['backpacking', 'budget travel', 'Southeast Asia'] },
  { name: 'National Parks Road Trippers', category: 'Travel Buddies', location: 'Los Angeles, CA',
    description: 'Slow-paced RV and cabin trips through the national parks for travelers who like an easy pace.',
    tags: ['national parks', 'road trips', 'camping'] },
  { name: 'Festival Season Crew', category: 'Travel Buddies', location: 'Los Angeles, CA',
    description: 'Coordinating tickets, carpools, and campsites for the big SoCal music festivals.',
    tags: ['music festivals', 'camping', 'carpooling'] },

  // ── Project Collaboration ───────────────────────────────────────────────
  { name: 'Build a Fitness App MVP in 90 Days', category: 'Project Collaboration', location: 'Los Angeles, CA',
    description: 'A developer-led team building a fitness app MVP. Looking for a designer and a marketer.',
    tags: ['app development', 'fitness', 'startups'] },
  { name: 'Indie Short Film — Crew Wanted', category: 'Project Collaboration', location: 'Los Angeles, CA',
    description: 'A finished short film script looking for a DP, editor, and actors to bring it to life.',
    tags: ['filmmaking', 'acting', 'screenwriting'] },
  { name: 'South LA Community Garden Project', category: 'Project Collaboration', location: 'South Los Angeles, CA',
    description: 'Volunteers planning, fundraising for, and building a neighborhood community garden.',
    tags: ['gardening', 'volunteering', 'community'] },
  { name: 'True Crime Podcast Co-Hosts', category: 'Project Collaboration', location: 'Los Angeles, CA',
    description: 'Launching a weekly true crime podcast. Looking for a co-host and an audio editor.',
    tags: ['podcasting', 'true crime', 'audio editing'] },
  { name: '48-Hour Game Jam Team', category: 'Project Collaboration', location: 'Los Angeles, CA',
    description: 'Building a team for the next Global Game Jam: programmers, artists, and sound designers.',
    tags: ['game development', 'programming', 'pixel art'] },

  // ── Event Buddies ───────────────────────────────────────────────────────
  { name: 'Hollywood Bowl Concert Crew', category: 'Event Buddies', location: 'Hollywood, CA',
    description: "Going to shows solo? Join others who'd rather share the night (and the parking).",
    tags: ['concerts', 'live music'] },
  { name: 'Dodgers Weeknight Games Crew', category: 'Event Buddies', location: 'Los Angeles, CA',
    description: 'Splitting ticket packages and tailgating at weeknight Dodgers games.',
    tags: ['baseball', 'Dodgers', 'tailgating'] },
  { name: 'LA Marathon 2027 Training Group', category: 'Event Buddies', location: 'Los Angeles, CA',
    description: 'Training together for the 2027 LA Marathon with a shared schedule and weekend long runs.',
    tags: ['running', 'marathon', 'fitness'] },
  { name: 'Open Mic & Comedy Night Regulars', category: 'Event Buddies', location: 'Los Angeles, CA',
    description: 'Hitting a different comedy club or open mic every week.',
    tags: ['comedy', 'nightlife', 'live shows'] },
  { name: 'Museum First Fridays', category: 'Event Buddies', location: 'Los Angeles, CA',
    description: 'Gallery openings, museum after-hours events, and art walks around the city.',
    tags: ['art', 'museums', 'culture'] },

  // ── Specialized Groups ───────────────────────────────────────────────────
  { name: 'Sober Socials LA', category: 'Specialized Groups', location: 'Los Angeles, CA',
    description: 'Alcohol-free hangouts: mocktail bars, hikes, pottery classes, and more.',
    tags: ['sober curious', 'hiking', 'crafts'] },
  { name: 'Stroller Walks — Pasadena', category: 'Specialized Groups', location: 'Pasadena, CA',
    description: 'Daytime walks and coffee for parents of babies under one.',
    tags: ['parenting', 'walking', 'coffee'] },
  { name: 'Vets in Tech', category: 'Specialized Groups', location: 'Los Angeles, CA',
    description: 'Veterans moving into software careers, sharing resources, mentorship, and job leads.',
    tags: ['veterans', 'software engineering', 'mentorship'] },
  { name: 'Spanish Conversation Exchange', category: 'Specialized Groups', location: 'Los Angeles, CA',
    description: 'Native speakers and learners paired up for weekly Spanish conversation practice.',
    tags: ['Spanish', 'language exchange', 'culture'] },
  { name: 'Reactive Dog Owners Support', category: 'Specialized Groups', location: 'Los Angeles, CA',
    description: 'Owners of anxious or reactive dogs sharing trainer recommendations and setting up controlled meetups.',
    tags: ['dogs', 'pets', 'training'] },
];

// Runs on the transaction's own client, and must commit (as part of that one
// transaction) before the first Hive insert below — the billing guard trigger
// on hives checks users.is_system at INSERT time, so the house account has to
// already be flagged is_system = true inside the same transaction, not in a
// separate earlier statement that could theoretically race or be skipped.
async function ensureHouseAccount(client) {
  const rawPassword = crypto.randomBytes(64).toString('hex');
  const passwordHash = await bcrypt.hash(rawPassword, SALT_ROUNDS);
  // rawPassword is discarded here — never logged, never stored anywhere but
  // as the bcrypt hash, so nobody (including us) can log in as this account.

  const { rows: [user] } = await client.query(
    `INSERT INTO users (email, password_hash, is_system, account_status, email_verified)
     VALUES ($1, $2, TRUE, 'active', TRUE)
     ON CONFLICT (email) DO UPDATE SET is_system = TRUE
     RETURNING user_id`,
    [SEED_OWNER_EMAIL, passwordHash],
  );
  await client.query(
    `INSERT INTO profiles (user_id, full_name) VALUES ($1, 'TrueHive Team')
     ON CONFLICT (user_id) DO UPDATE SET full_name = 'TrueHive Team'`,
    [user.user_id],
  );
  return user.user_id;
}

async function categoryIdFor(categoryName) {
  const { rows: [row] } = await query(
    `SELECT category_id FROM categories WHERE category_name = $1`,
    [categoryName],
  );
  if (!row) throw new Error(`Unknown category "${categoryName}" — did migrate seed the categories table?`);
  return row.category_id;
}

async function run() {
  if (process.env.NODE_ENV === 'production' && !YES) {
    console.error('✗ Refusing to seed starter Hives into production. Pass --yes to override.');
    process.exit(1);
  }

  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`Target DB host: ${host}`);

  const client = await getClient();
  let created = 0, updated = 0;
  try {
    await client.query('BEGIN');

    const ownerId = await ensureHouseAccount(client);
    console.log(`House account ready: ${SEED_OWNER_EMAIL} (is_system) — committed with the first Hive below`);

    for (const h of SEED_HIVES) {
      const categoryId = await categoryIdFor(h.category);
      const metroKey = await resolveLocationMetro(h.location);

      const { rows: [existing] } = await client.query(
        `SELECT hive_id FROM hives WHERE hive_name = $1 AND is_seed = TRUE`,
        [h.name],
      );

      let hiveId;
      if (existing) {
        hiveId = existing.hive_id;
        await client.query(
          `UPDATE hives SET
             category_id = $1, description = $2, tags = $3, location = $4,
             location_type = 'in-person', metro_key = $5, discoverable = TRUE,
             join_policy = 'request', hive_status = 'active',
             plan_proposers = $6, plan_approval = $7, updated_at = NOW()
           WHERE hive_id = $8`,
          [categoryId, h.description, JSON.stringify(h.tags), h.location, metroKey,
           SEED_PLAN_RULES.plan_proposers, SEED_PLAN_RULES.plan_approval, hiveId],
        );
        updated++;
      } else {
        const { rows: [hive] } = await client.query(
          `INSERT INTO hives (
             creator_user_id, category_id, hive_name, description, tags,
             join_policy, discoverable, location_type, location, metro_key,
             plan_proposers, plan_approval, is_seed
           ) VALUES ($1,$2,$3,$4,$5,'request',TRUE,'in-person',$6,$7,$8,$9,TRUE)
           RETURNING hive_id`,
          [ownerId, categoryId, h.name, h.description, JSON.stringify(h.tags),
           h.location, metroKey, SEED_PLAN_RULES.plan_proposers, SEED_PLAN_RULES.plan_approval],
        );
        hiveId = hive.hive_id;

        await client.query(
          `INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
           VALUES ($1, 'general', 'text', TRUE, 0)`,
          [hiveId],
        );
        created++;
      }

      // Owner membership — present on both create and update, idempotent.
      await client.query(
        `INSERT INTO hive_members (hive_id, user_id, role, membership_status, welcome_seen_at, onboarding_status)
         VALUES ($1, $2, 'owner', 'active', NOW(), 'completed')
         ON CONFLICT (hive_id, user_id) DO UPDATE SET
           role = 'owner', membership_status = 'active'`,
        [hiveId, ownerId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Starter Hives: ${created} created, ${updated} updated (${created + updated} total this run).`);

  const { rows: [{ count }] } = await query(`SELECT COUNT(*)::int AS count FROM hives WHERE is_seed = TRUE`);
  console.log(`Total seed Hives in DB: ${count}`);

  const { rows: perCategory } = await query(
    `SELECT c.category_name, COUNT(h.hive_id)::int AS n
     FROM hives h JOIN categories c ON c.category_id = h.category_id
     WHERE h.is_seed = TRUE
     GROUP BY c.category_name ORDER BY c.category_name`,
  );
  for (const row of perCategory) console.log(`  ${row.category_name}: ${row.n}`);

  await pool.end();
}

run().catch(err => {
  console.error('[seedHives] failed:', err);
  process.exit(1);
});
