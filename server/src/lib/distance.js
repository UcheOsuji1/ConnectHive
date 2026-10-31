/**
 * Real haversine distance filtering — shared between every endpoint that
 * needs it (matchHives, getFilterFacets, getSuggestions), so the radius
 * means the same number of miles everywhere and the SQL/JS math is written
 * exactly once.
 */
import { query } from '../db/index.js';
import { geocode } from '../services/geocode.js';

export const EARTH_RADIUS_MI = 3958.8;
// Miles per degree of latitude is ~constant; longitude compresses toward the
// poles, so it's divided by cos(latitude) — clamped so a request anywhere
// near the equator (cos ≈ 1) never divides by something tiny either way.
const MILES_PER_DEGREE_LAT = 69.0;

/**
 * Resolves the origin point for a distance search.
 * - `locationText`, if given, is geocoded and used for THIS call only.
 * - Otherwise falls back to the caller's own saved profile coordinates.
 * - Returns null if neither resolves — callers skip distance filtering then.
 */
export async function resolveOrigin({ userId, locationText }) {
  if (locationText) {
    const geo = await geocode(locationText);
    if (geo) return { lat: geo.latitude, lng: geo.longitude };
    // Fall through to the saved profile location rather than failing the
    // whole search just because this one piece of typed text didn't geocode.
  }
  const { rows: [profile] } = await query(
    `SELECT latitude, longitude FROM profiles WHERE user_id = $1`,
    [userId],
  );
  if (profile?.latitude != null && profile?.longitude != null) {
    return { lat: profile.latitude, lng: profile.longitude };
  }
  return null;
}

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const toRad = d => (d * Math.PI) / 180;
  const cosArg = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2) - toRad(lng1))
    + Math.sin(toRad(lat1)) * Math.sin(toRad(lat2));
  // Guard float drift at the poles/antipodes before acos, same as the SQL LEAST/GREATEST below.
  return EARTH_RADIUS_MI * Math.acos(Math.min(1, Math.max(-1, cosArg)));
}

// Rounding rule everywhere distance is shown: 1 decimal under 10 mi, whole
// number at/above it. Returns null unchanged (never shown for online Hives).
export function formatDistance(miles) {
  if (miles == null) return null;
  const n = Number(miles);
  return n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
}

/**
 * Builds the SQL pieces for a parameterized candidate query, appending to the
 * caller's own `params` array (same pattern matchHives already uses for its
 * other dynamic clauses) and returning $N-indexed fragments.
 *
 * - `origin` is `{ lat, lng } | null` from resolveOrigin().
 * - `maxMiles` is a number, or null for "Any distance" (origin known, but no
 *   radius cap — still computes distance_miles for display, filters nothing).
 *
 * Returns { selectExpr, whereClause }. When origin is null, selectExpr is a
 * literal NULL and whereClause is '' — i.e. a complete no-op, same shape as
 * when distance filtering was never requested at all.
 */
export function buildDistanceSql(alias, params, origin, maxMiles) {
  if (!origin) return { selectExpr: 'NULL::double precision', whereClause: '' };

  params.push(origin.lat);
  const latIdx = params.length;
  params.push(origin.lng);
  const lngIdx = params.length;

  const haversine = `(${EARTH_RADIUS_MI} * acos(LEAST(1, GREATEST(-1,
      cos(radians($${latIdx})) * cos(radians(${alias}.latitude)) * cos(radians(${alias}.longitude) - radians($${lngIdx}))
      + sin(radians($${latIdx})) * sin(radians(${alias}.latitude))
    ))))`;
  const selectExpr = `CASE WHEN ${alias}.location_type = 'online' OR ${alias}.latitude IS NULL THEN NULL ELSE ${haversine} END`;

  let whereClause = '';
  if (maxMiles != null) {
    const latDelta = maxMiles / MILES_PER_DEGREE_LAT;
    const cosLat = Math.max(0.01, Math.cos((origin.lat * Math.PI) / 180));
    const lngDelta = maxMiles / (MILES_PER_DEGREE_LAT * cosLat);
    params.push(origin.lat - latDelta);
    const latLoIdx = params.length;
    params.push(origin.lat + latDelta);
    const latHiIdx = params.length;
    params.push(origin.lng - lngDelta);
    const lngLoIdx = params.length;
    params.push(origin.lng + lngDelta);
    const lngHiIdx = params.length;
    params.push(maxMiles);
    const milesIdx = params.length;

    // In-person/hybrid Hives with no coordinates yet are only included when
    // there's no cap at all (maxMiles === null, handled by the branch above
    // never reaching here) — with a real radius, "distance unknown" can't be
    // claimed to be "in range."
    whereClause = `AND (${alias}.location_type = 'online' OR (
      ${alias}.latitude IS NOT NULL
      AND ${alias}.latitude  BETWEEN $${latLoIdx} AND $${latHiIdx}
      AND ${alias}.longitude BETWEEN $${lngLoIdx} AND $${lngHiIdx}
      AND ${haversine} <= $${milesIdx}
    ))`;
  }

  return { selectExpr, whereClause };
}
