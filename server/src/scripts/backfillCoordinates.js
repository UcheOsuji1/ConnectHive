/**
 * TrueHive — backfill coordinates for the distance radius filter (Prompt 79)
 *
 * Geocodes every user profile and every Hive that has location text but no
 * latitude/longitude yet (Hives with location_type = 'online' are skipped —
 * they have no meeting place to measure distance from). Safe to re-run:
 * anything that already has coordinates, or has none to geocode, is left
 * alone. Respects the 1 request/second throttle built into the geocode
 * service, so this can take a while on a large table.
 *
 * Usage:
 *   node src/scripts/backfillCoordinates.js
 */

import '../env.js';
import { pool, query } from '../db/index.js';
import { geocode } from '../services/geocode.js';

// Matches geocode.js's own normalization exactly, so a cache-hit check here
// looks up the same key the service would.
function normalizeQuery(text) {
  return String(text ?? '').trim().toLowerCase();
}

async function wasAlreadyCached(location) {
  const { rows } = await query('SELECT 1 FROM geocode_cache WHERE query = $1', [normalizeQuery(location)]);
  return rows.length > 0;
}

async function backfillProfiles() {
  const { rows } = await query(
    `SELECT user_id, location FROM profiles
     WHERE location IS NOT NULL AND location <> '' AND (latitude IS NULL OR longitude IS NULL)`,
  );

  let updated = 0, cached = 0, failed = 0;
  const failures = [];
  for (const row of rows) {
    const hadCacheEntry = await wasAlreadyCached(row.location);
    const geo = await geocode(row.location);
    if (geo) {
      await query('UPDATE profiles SET latitude = $1, longitude = $2 WHERE user_id = $3',
        [geo.latitude, geo.longitude, row.user_id]);
      hadCacheEntry ? cached++ : updated++;
    } else {
      failed++;
      failures.push({ label: `user ${row.user_id}`, location: row.location });
    }
  }
  return { total: rows.length, updated, cached, failed, failures };
}

async function backfillHives() {
  const { rows } = await query(
    `SELECT hive_id, hive_name, location FROM hives
     WHERE location_type <> 'online'
       AND location IS NOT NULL AND location <> ''
       AND (latitude IS NULL OR longitude IS NULL)`,
  );

  let updated = 0, cached = 0, failed = 0;
  const failures = [];
  for (const row of rows) {
    const hadCacheEntry = await wasAlreadyCached(row.location);
    const geo = await geocode(row.location);
    if (geo) {
      await query('UPDATE hives SET latitude = $1, longitude = $2 WHERE hive_id = $3',
        [geo.latitude, geo.longitude, row.hive_id]);
      hadCacheEntry ? cached++ : updated++;
    } else {
      failed++;
      failures.push({ label: row.hive_name, location: row.location });
    }
  }
  return { total: rows.length, updated, cached, failed, failures };
}

async function run() {
  console.log('Backfilling profile coordinates...');
  const profiles = await backfillProfiles();
  console.log(`Profiles: ${profiles.total} total, ${profiles.updated} updated, ${profiles.cached} from cache, ${profiles.failed} failed.`);

  console.log('Backfilling Hive coordinates...');
  const hives = await backfillHives();
  console.log(`Hives: ${hives.total} total, ${hives.updated} updated, ${hives.cached} from cache, ${hives.failed} failed.`);

  const failures = [...profiles.failures, ...hives.failures];
  if (failures.length) {
    console.log('\nFailed to geocode:');
    for (const f of failures) console.log(`  - ${f.label}: "${f.location}"`);
  }

  console.log('\nDone.');
  await pool.end();
}

run().catch(err => {
  console.error('[backfillCoordinates] failed:', err);
  process.exit(1);
});
