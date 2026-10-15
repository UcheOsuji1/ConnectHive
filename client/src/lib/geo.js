import { api } from './api.js';

// Metros are fetched once and kept in memory for the life of the tab — the
// list rarely changes and is already Cache-Control'd for a day server-side.
let metrosCache = null;
export async function getCachedMetros() {
  if (metrosCache) return metrosCache;
  metrosCache = await api.get('/api/metros');
  return metrosCache;
}

function toRad(deg) { return (deg * Math.PI) / 180; }

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const LA_SUBLINE = 'Includes Santa Monica, Pasadena, Burbank, Long Beach and the rest of LA County';

// Nearest metro to a lat/lng, or null if nothing is within 75 miles. The
// coordinates passed in never leave this function — callers only persist
// the returned metro_key.
export function nearestMetro(lat, lng, metros) {
  let best = null;
  let bestDist = Infinity;
  for (const m of metros) {
    if (m.lat == null || m.lng == null) continue;
    const d = haversineMiles(lat, lng, m.lat, m.lng);
    if (d < bestDist) { bestDist = d; best = m; }
  }
  if (!best || bestDist > 75) return null;
  return best;
}

export function metroSubline(metro) {
  if (!metro) return '';
  if (metro.metro_key === 'los-angeles') return LA_SUBLINE;
  const cities = metro.principalCities ?? [];
  if (!cities.length) return '';
  return `Includes ${cities.join(', ')} and the rest of ${metro.name}`;
}

export async function searchPlacesApi(q) {
  if (!q || !q.trim()) return [];
  return api.get(`/api/metros/places?q=${encodeURIComponent(q.trim())}`);
}
