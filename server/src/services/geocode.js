/**
 * Geocoding — OpenStreetMap Nominatim, no API key.
 *
 * One module so the provider can be swapped later without touching any
 * caller: everyone outside this file only ever sees geocode()/reverseGeocode(),
 * never a Nominatim URL or response shape.
 *
 * Nominatim's usage policy requires a real identifying User-Agent and caps
 * usage at ~1 request/second from a single client — both enforced here, not
 * left to callers to remember. Every result (including a miss) is cached in
 * geocode_cache so the same location text is never looked up twice.
 */
import { query } from '../db/index.js';

const BASE_URL = 'https://nominatim.openstreetmap.org';
const USER_AGENT = process.env.GEOCODER_USER_AGENT || 'TrueHive/1.0 (contact: support@truehive.app)';
const TIMEOUT_MS = 5000;
const MIN_INTERVAL_MS = 1000; // max 1 request/second

// ── Throttle queue ───────────────────────────────────────────────────────────
// A simple in-process chain — every call to throttledFetch() waits for the
// previous one to finish, then waits out whatever's left of the 1s window.
// Good enough for a single Node process; would need a shared (Redis-backed)
// queue across multiple instances, which this app doesn't run.
let chain = Promise.resolve();
let lastRequestAt = 0;

function throttledFetch(url) {
  const run = chain.then(async () => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  });
  // Keep the chain alive even if this particular call fails, so one bad
  // lookup doesn't wedge every geocode call after it.
  chain = run.catch(() => {});
  return run;
}

function normalizeQuery(text) {
  return String(text ?? '').trim().toLowerCase();
}

/**
 * Resolves free-text location to coordinates.
 * @returns {Promise<{latitude:number, longitude:number, displayName:string}|null>}
 */
export async function geocode(text) {
  const normalized = normalizeQuery(text);
  if (!normalized) return null;

  try {
    const { rows: [cached] } = await query(
      `SELECT latitude, longitude, display_name FROM geocode_cache WHERE query = $1`,
      [normalized],
    );
    if (cached) {
      return cached.latitude != null
        ? { latitude: cached.latitude, longitude: cached.longitude, displayName: cached.display_name }
        : null;
    }

    const url = `${BASE_URL}/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(normalized)}`;
    const results = await throttledFetch(url);
    const top = Array.isArray(results) ? results[0] : null;
    const result = top
      ? { latitude: parseFloat(top.lat), longitude: parseFloat(top.lon), displayName: top.display_name }
      : null;

    await query(
      `INSERT INTO geocode_cache (query, latitude, longitude, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (query) DO UPDATE SET
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, display_name = EXCLUDED.display_name`,
      [normalized, result?.latitude ?? null, result?.longitude ?? null, result?.displayName ?? null],
    );
    return result;
  } catch (err) {
    console.warn('[geocode] lookup failed, returning null:', err.message);
    return null;
  }
}

/**
 * Resolves coordinates to a short city label, e.g. "Los Angeles, CA".
 * Not cached — reverse lookups aren't keyed the same way as the forward
 * geocode_cache (which is keyed by free-text query), and a precise lat/lng
 * pair is effectively unique per caller already.
 * @returns {Promise<{label:string}|null>}
 */
export async function reverseGeocode(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) return null;
  try {
    const url = `${BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`;
    const result = await throttledFetch(url);
    const addr = result?.address;
    if (!addr) return null;
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || null;
    // Nominatim gives the state as a full name (e.g. "California") but
    // "ISO3166-2-lvl4" as "US-CA" — prefer the 2-letter code from that.
    const isoState = typeof addr['ISO3166-2-lvl4'] === 'string' ? addr['ISO3166-2-lvl4'].split('-')[1] : null;
    const state = isoState || addr.state_code || addr.state || null;
    const label = [city, state].filter(Boolean).join(', ');
    return label ? { label } : null;
  } catch (err) {
    console.warn('[geocode] reverse lookup failed, returning null:', err.message);
    return null;
  }
}
