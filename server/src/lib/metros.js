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
  return s;
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
  const { city, state } = splitCityState(String(locationText).replace(/,\s*USA\s*$/i, ''));
  const normCity = normalizePlace(city);
  if (!normCity) return null;

  if (state) {
    const { rows } = await query(
      `SELECT metro_key FROM metro_places WHERE place_key = $1`,
      [`${normCity}|${state.toLowerCase()}`],
    );
    if (rows[0]) return rows[0].metro_key;
    const { rows: areas } = await query(
      `SELECT metro_key FROM metros WHERE normalize_place(name) = $1 AND $2 = ANY(state_codes)`,
      [normCity, state],
    );
    return areas.length === 1 ? areas[0].metro_key : null;
  }

  const { rows } = await query(
    `SELECT DISTINCT metro_key, state_code FROM metro_places WHERE place_key LIKE $1`,
    [`${normCity}|%`],
  );
  if (rows.length === 0) {
    const { rows: areas } = await query(
      `SELECT metro_key FROM metros WHERE normalize_place(name) = $1 OR replace(metro_key, '-', ' ') = $1`,
      [normCity],
    );
    return areas.length === 1 ? areas[0].metro_key : null;
  }
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
  const parsed = /,\s*[a-z]{2}$/i.test(q) || /\s[A-Z]{2}$/.test(q)
    ? splitCityState(q) : { city: q, state: null };
  const norm = normalizePlace(parsed.city);
  if (!norm) return [];
  const { rows } = await query(
    `SELECT display_name, state_code, metro_key, metro_name, kind FROM (
       SELECT mp.display_name, mp.state_code, mp.metro_key, m.name AS metro_name, mp.kind,
              CASE WHEN split_part(mp.place_key, '|', 1) = $2 THEN 0 ELSE 1 END AS match_rank, m.rank
         FROM metro_places mp JOIN metros m ON m.metro_key = mp.metro_key
        WHERE mp.place_key LIKE $1 AND ($4::text IS NULL OR mp.state_code = $4)
       UNION ALL
       SELECT m.name, NULL::text, m.metro_key, m.name, 'metro',
              CASE WHEN normalize_place(m.name) = $2 THEN 0 ELSE 2 END, m.rank
         FROM metros m WHERE (normalize_place(m.name) LIKE $1 OR replace(m.metro_key, '-', ' ') LIKE $1)
           AND ($4::text IS NULL OR $4 = ANY(m.state_codes))
     ) candidates ORDER BY match_rank, rank ASC NULLS LAST, display_name ASC LIMIT $3`,
    [`${norm}%`, norm, limit, parsed.state],
  );
  return rows;
}

// A supplied key is a hint, never authority to attach unrelated free text to an area.
// Unknown manual text stays intact with a NULL association; no records are backfilled.
export async function resolveLocationMetro(locationText, suppliedKey = null) {
  const resolved = await resolveMetro(locationText);
  if (suppliedKey && suppliedKey !== resolved) {
    const err = new Error('The selected area does not match this location. Choose a suggestion or keep the location as manual text.');
    err.status = 400;
    throw err;
  }
  return resolved;
}

export async function metroByKey(metroKey) {
  if (!metroKey) return null;
  const { rows: [row] } = await query(`SELECT metro_key, name, lat, lng FROM metros WHERE metro_key = $1`, [metroKey]);
  return row ?? null;
}
