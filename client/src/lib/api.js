/**
 * Thin fetch wrapper.
 *
 * Uses VITE_API_URL when set (direct to :5000) or falls back to '' so
 * requests hit the Vite proxy at /api/… — both approaches work.
 */
const BASE = import.meta.env.VITE_API_URL ?? '';

async function request(path, { body, method = 'GET', headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',          // always send / receive the auth cookie
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Parse JSON regardless of status so we can surface server error messages
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }

  return data;
}

export const api = {
  get:    (path)       => request(path),
  post:   (path, body) => request(path, { method: 'POST',   body }),
  put:    (path, body) => request(path, { method: 'PUT',    body }),
  delete: (path)       => request(path, { method: 'DELETE' }),
};
