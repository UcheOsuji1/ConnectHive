import { resolveLocationMetro } from './metros.js';
import { norm } from './compatibility.js';

export const sizeBucket = max => max == null ? 'large' : max <= 10 ? 'small' : max <= 30 ? 'medium' : 'large';
export async function readRefineFilters(query = {}) {
  const list = value => value ? String(value).split(',').filter(Boolean) : [];
  const location = String(query.location || '').trim();
  return { location, metroKey: await resolveLocationMetro(location, query.metro_key),
    connection: list(query.connection), groupSize: list(query.groupSize), cadence: list(query.cadence) };
}
export function matchesRefine(hive, filters, skip = {}) {
  if (!skip.location && filters.location && !(hive.location_type === 'online' ||
      (filters.metroKey && hive.metro_key === filters.metroKey && ['in-person', 'hybrid'].includes(hive.location_type)))) return false;
  if (!skip.conn && filters.connection.length && !filters.connection.includes(hive.location_type)) return false;
  if (!skip.size && filters.groupSize.length && !filters.groupSize.includes(sizeBucket(hive.max_members))) return false;
  if (!skip.cadence && filters.cadence.length && !filters.cadence.includes(norm(hive.cadence))) return false;
  return true;
}
