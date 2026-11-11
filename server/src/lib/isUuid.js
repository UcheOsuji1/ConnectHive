// Shared UUID-shape check — every router.param() guarding a path segment
// that feeds a Postgres uuid column uses this before running any query.
// A malformed value must never reach the database: Postgres's cast error
// ("invalid input syntax for type uuid") is real error text, and a route
// whose own 404/401 checks run after the query would otherwise leak it.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
