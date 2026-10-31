import { resolveLocationMetro } from './metros.js';
import { norm } from './compatibility.js';
import { haversineMiles } from './distance.js';

export const sizeBucket = max => max == null ? 'large' : max <= 10 ? 'small' : max <= 30 ? 'medium' : 'large';
export async function readRefineFilters(query = {}) {
  const list = value => value ? String(value).split(',').filter(Boolean) : [];
  const location = String(query.location || '').trim();
  // max_distance: absent key -> undefined (caller decides the default, e.g.
  // the user's saved max_distance_miles); '' or 'any' -> null ("Any distance");
  // otherwise a mile count.
  const maxDistanceRaw = query.max_distance;
  const maxDistance = maxDistanceRaw === undefined ? undefined
    : (maxDistanceRaw === '' || String(maxDistanceRaw).toLowerCase() === 'any') ? null
    : parseInt(maxDistanceRaw, 10);
  return { location, metroKey: await resolveLocationMetro(location, query.metro_key),
    connection: list(query.connection), groupSize: list(query.groupSize), cadence: list(query.cadence),
    maxDistance };
}

// Distance is deliberately NOT folded into matchesRefine() above — that
// function has no access to a resolved origin point, and is shared by call
// sites (getFilterFacets, getSuggestions) that each resolve origin
// differently (live search text vs. the caller's saved coordinates only).
// Every caller applies this as its own explicit step alongside matchesRefine.
export function withinDistance(hive, origin, maxMiles) {
  if (!origin || maxMiles == null) return true;
  if (hive.location_type === 'online') return true;
  if (hive.latitude == null || hive.longitude == null) return false;
  return haversineMiles(origin.lat, origin.lng, hive.latitude, hive.longitude) <= maxMiles;
}
export function matchesRefine(hive, filters, skip = {}) {
  if (!skip.location && filters.location && !(hive.location_type === 'online' ||
      (filters.metroKey && hive.metro_key === filters.metroKey && ['in-person', 'hybrid'].includes(hive.location_type)))) return false;
  if (!skip.conn && filters.connection.length && !filters.connection.includes(hive.location_type)) return false;
  if (!skip.size && filters.groupSize.length && !filters.groupSize.includes(sizeBucket(hive.max_members))) return false;
  if (!skip.cadence && filters.cadence.length && !filters.cadence.includes(norm(hive.cadence))) return false;
  return true;
}
