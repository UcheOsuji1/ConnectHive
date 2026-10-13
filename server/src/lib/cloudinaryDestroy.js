/**
 * Signed Cloudinary asset destruction — the missing half of the signed
 * upload helpers in mediaController.js/messagesController.js. No SDK: same
 * raw signed-request pattern those already use (SHA-1 over sorted params +
 * API_SECRET), just pointed at /destroy instead of /upload.
 *
 * Used by the purge job to actually remove images, not just their URL
 * references, when a deleted account's profile photo or a deleted Hive's
 * media would otherwise stay reachable at its old link forever.
 */
import crypto from 'crypto';

const RESOURCE_TYPES = new Set(['image', 'video', 'raw']);

// https://res.cloudinary.com/{cloud}/{resource_type}/upload/(v{version}/)?{public_id}.{ext}
// Folders are part of public_id — only the version segment and the trailing
// extension get stripped.
const CLOUDINARY_PATH_RE = /^\/([^/]+)\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/;

function _parse(url, cloudName) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'res.cloudinary.com') return null;

  const m = CLOUDINARY_PATH_RE.exec(u.pathname);
  if (!m) return null;
  const [, pathCloudName, resourceType, rest] = m;
  if (pathCloudName !== cloudName) return null;
  if (!RESOURCE_TYPES.has(resourceType)) return null;

  const publicId = rest.replace(/\.[^./]+$/, '');
  if (!publicId) return null;

  return { resourceType, publicId };
}

/**
 * Destroys the Cloudinary asset at `url`. Never throws — every failure mode
 * (wrong host, unparseable path, missing config, a rejected request) comes
 * back as a plain result the caller logs and moves on from.
 *
 * @returns {Promise<{ skipped: string } | { ok: true, result: string } | { ok: false, error: string }>}
 */
export async function destroyByUrl(url) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey    = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return { skipped: 'Cloudinary is not configured' };
  }

  const parsed = _parse(url, cloudName);
  if (!parsed) return { skipped: 'not ours' };

  const { resourceType, publicId } = parsed;
  const timestamp = Math.round(Date.now() / 1000);
  // invalidate=true is part of the signed payload too — best-effort CDN
  // cache purge alongside the origin delete. Even with it, Cloudinary's own
  // docs don't promise instant edge invalidation, so a URL can keep
  // resolving via CDN cache for a while after a genuinely successful
  // destroy; `result` in the response is the authoritative signal, not a
  // follow-up fetch of the delivery URL.
  const paramsStr = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(paramsStr + apiSecret).digest('hex');

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          public_id: publicId,
          timestamp: String(timestamp),
          signature,
          api_key: apiKey,
          invalidate: 'true',
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, publicId, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    // Cloudinary returns { result: 'ok' } or { result: 'not found' } — both
    // are successful outcomes from the caller's point of view (the asset is
    // gone, or was already gone).
    return { ok: true, publicId, result: data.result };
  } catch (err) {
    return { ok: false, publicId, error: err.message };
  }
}
