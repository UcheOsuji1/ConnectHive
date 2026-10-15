import { query } from '../db/index.js';

// Metros with a live launch city — "outside LA" screens, prefill copy, etc.
// branch on this, not on `metros.rank` or any other proxy.
export const LAUNCH_METROS = ['los-angeles'];

// Mirrors the SQL normalize_place() function in schema.sql EXACTLY — same
// steps, same order. If these two ever drift, a place inserted by one and
// looked up by the other silently misses.
export function normalizePlace(input) {
  if (input == null) return null;
  let s = String(input).toLowerCase().trim();
  s = s.replace(/,?\s*usa\s*$/i, '').trim();
  s = s.replace(/\bst\./g, 'saint');
  s = s.replace(/\bft\./g, 'fort');
  s = s.replace(/[^a-z0-9\s]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s || null;
}

// "City, ST" or "City ST" (comma optional) — the trailing two-letter token,
// if present, is treated as the state; everything before it is the city.
function splitCityState(text) {
  const trimmed = String(text).trim();
  const m = trimmed.match(/^(.*?),?\s+([A-Za-z]{2})$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return { city: trimmed, state: null };
}

// Resolves free-text "City, ST" (or a bare city/neighborhood name) to a
// metro_key, or null if it can't be placed confidently. A bare city name
// that exists in more than one state is left NULL rather than guessed —
// same rule the one-time backfill migration uses, so the two never disagree.
export async function resolveMetro(locationText) {
  if (!locationText) return null;
  const { city, state } = splitCityState(locationText);
  const normCity = normalizePlace(city);
  if (!normCity) return null;

  if (state) {
    const { rows } = await query(
      `SELECT metro_key FROM metro_places WHERE place_key = $1`,
      [`${normCity}|${state.toLowerCase()}`],
    );
    return rows[0]?.metro_key ?? null;
  }

  const { rows } = await query(
    `SELECT DISTINCT metro_key, state_code FROM metro_places WHERE place_key LIKE $1`,
    [`${normCity}|%`],
  );
  if (rows.length === 0) return null;
  const distinctStates = new Set(rows.map(r => r.state_code));
  if (distinctStates.size > 1) return null; // ambiguous — don't guess
  const distinctMetros = new Set(rows.map(r => r.metro_key));
  return distinctMetros.size === 1 ? rows[0].metro_key : null;
}

// Each metro's own first 4 principal (kind='city') places, alphabetically —
// used client-side for the Q2 "Includes X, Y, Z and the rest of {metro}"
// sub-line on every metro except Los Angeles, which gets fixed launch copy.
export async function listMetros() {
  const { rows } = await query(
    `SELECT m.metro_key, m.name, m.lat, m.lng,
            COALESCE(pc.cities, '{}') AS "principalCities"
       FROM metros m
       LEFT JOIN LATERAL (
         SELECT array_agg(display_name ORDER BY display_name) AS cities
           FROM (
             SELECT display_name FROM metro_places
              WHERE metro_key = m.metro_key AND kind = 'city'
              ORDER BY display_name ASC LIMIT 4
           ) sub
       ) pc ON true
      ORDER BY m.rank ASC NULLS LAST`,
  );
  return rows;
}

export async function searchPlaces(q, limit = 8) {
  const norm = normalizePlace(q);
  if (!norm) return [];
  const { rows } = await query(
    `SELECT mp.display_name, mp.state_code, mp.metro_key, m.name AS metro_name
       FROM metro_places mp
       JOIN metros m ON m.metro_key = mp.metro_key
      WHERE mp.place_key LIKE $1
      ORDER BY (split_part(mp.place_key, '|', 1) = $2) DESC, m.rank ASC NULLS LAST, mp.display_name ASC
      LIMIT $3`,
    [`${norm}%`, norm, limit],
  );
  return rows;
}

export async function metroByKey(metroKey) {
  if (!metroKey) return null;
  const { rows: [row] } = await query(`SELECT metro_key, name, lat, lng FROM metros WHERE metro_key = $1`, [metroKey]);
  return row ?? null;
}
