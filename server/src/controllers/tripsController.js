// Itinerary (Prompt 66 Part 1, tool_key = 'itinerary') — a day-by-day trip
// plan the group builds together. CSS prefix (client): it-.
import { query } from '../db/index.js';
import { requireMembership, requireCanPost } from '../lib/hiveMembership.js';
import { getToolSettings } from '../lib/hiveTools.js';
import { positionBetween } from '../lib/fractionalPosition.js';
import { validateUrl } from '../lib/validateUrl.js';
import { getIO } from '../realtime/socket.js';

function broadcast(hiveId, payload) {
  try { getIO()?.to(`hive:${hiveId}`).emit('itinerary_updated', { hive_id: hiveId, ...payload }); }
  catch { /* no socket in tests */ }
}

// Same semantic as Docs' requireCanEdit (Prompt 63): owners/admins always
// can; a member can too only when the Hive's `editors` setting is 'members'
// (the default) — otherwise only owners/admins may create/edit/delete.
async function requireCanEditItinerary(hiveId, userId) {
  const member = await requireMembership(hiveId, userId);
  const isOwnerOrAdmin = member.role === 'owner' || member.role === 'admin';
  if (isOwnerOrAdmin) return member;

  const settings = await getToolSettings(hiveId, 'itinerary');
  const editors = settings?.editors ?? 'members';
  if (editors !== 'members') {
    const err = new Error('Only owners and admins can edit the itinerary in this Hive.');
    err.status = 403;
    throw err;
  }
  await requireCanPost(hiveId, userId);
  return member;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// node-pg returns a DATE column as a JS Date object, not a bare
// "YYYY-MM-DD" string — String(dateObj) gives a locale string like "Fri Nov
// 20 2026 00:00:00 GMT-0800 ...", not an ISO date, so comparing that against
// a plain date string from req.body silently compares the wrong thing.
// Always route a DB-sourced date through this before comparing.
function toDateStr(d) {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

async function loadTrip(hiveId, tripId) {
  const { rows: [t] } = await query(
    `SELECT * FROM hive_trips WHERE trip_id = $1 AND hive_id = $2`, [tripId, hiveId]);
  if (!t) { const err = new Error('Trip not found.'); err.status = 404; throw err; }
  return t;
}

function shapeTrip(t) {
  return {
    trip_id: t.trip_id, title: t.title, destination: t.destination,
    starts_on: toDateStr(t.starts_on), ends_on: toDateStr(t.ends_on), cost_group_id: t.cost_group_id,
    created_by: t.created_by, created_at: t.created_at, archived_at: t.archived_at,
  };
}

function shapeItem(i) {
  return {
    item_id: i.item_id, day: toDateStr(i.day), time: i.time, title: i.title, location: i.location,
    url: i.url, notes: i.notes, plan_post_id: i.plan_post_id, position: Number(i.position),
    created_by: i.created_by, created_by_name: i.created_by_name ?? null, updated_at: i.updated_at,
  };
}

// ── GET /api/hives/:id/tools/itinerary/trips ───────────────────────────────
// Upcoming (including the current trip), then past — each newest-first
// within its own group, matching "upcoming, then past" from the prompt.
export const listTrips = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const { rows } = await query(
      `SELECT t.*, COUNT(i.item_id)::int AS item_count
         FROM hive_trips t
         LEFT JOIN hive_trip_items i ON i.trip_id = t.trip_id
        WHERE t.hive_id = $1 AND t.archived_at IS NULL
        GROUP BY t.trip_id
        ORDER BY (t.ends_on >= CURRENT_DATE) DESC, t.starts_on ASC`,
      [hiveId],
    );
    res.json({ trips: rows.map(t => ({ ...shapeTrip(t), item_count: t.item_count })) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/listTrips]', err);
    res.status(500).json({ error: 'Failed to load trips.' });
  }
};

// ── POST /api/hives/:id/tools/itinerary/trips ──────────────────────────────
export const createTrip = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);

    const title = String(req.body?.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const destination = String(req.body?.destination ?? '').trim();
    if (destination.length < 1 || destination.length > 120) return res.status(400).json({ error: 'Destination must be 1-120 characters.' });

    const startsOn = req.body?.startsOn;
    const endsOn = req.body?.endsOn;
    if (!DATE_RE.test(startsOn ?? '')) return res.status(400).json({ error: 'startsOn must be a valid date.' });
    if (!DATE_RE.test(endsOn ?? '')) return res.status(400).json({ error: 'endsOn must be a valid date.' });
    if (endsOn < startsOn) return res.status(400).json({ error: 'The trip cannot end before it starts.' });
    const spanDays = (new Date(endsOn) - new Date(startsOn)) / 86400000;
    if (spanDays > 60) return res.status(400).json({ error: 'A trip can span at most 60 days.' });

    let costGroupId = null;
    if (req.body?.costGroupId) {
      const { rows: [g] } = await query(`SELECT group_id FROM hive_cost_groups WHERE group_id = $1 AND hive_id = $2`, [req.body.costGroupId, hiveId]);
      if (!g) return res.status(400).json({ error: 'That cost group does not belong to this Hive.' });
      costGroupId = g.group_id;
    }

    const { rows: [t] } = await query(
      `INSERT INTO hive_trips (hive_id, title, destination, starts_on, ends_on, cost_group_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [hiveId, title, destination, startsOn, endsOn, costGroupId, req.userId],
    );
    broadcast(hiveId, { kind: 'trip_created', trip_id: t.trip_id });
    res.status(201).json({ trip: shapeTrip(t) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/createTrip]', err);
    res.status(500).json({ error: 'Failed to create this trip.' });
  }
};

// ── GET /api/hives/:id/tools/itinerary/trips/:tripId ───────────────────────
export const getTrip = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireMembership(hiveId, req.userId);
    const trip = await loadTrip(hiveId, req.params.tripId);

    const { rows: items } = await query(
      `SELECT i.*, pr.full_name AS created_by_name
         FROM hive_trip_items i
         LEFT JOIN profiles pr ON pr.user_id = i.created_by
        WHERE i.trip_id = $1
        ORDER BY i.day ASC, (i.time IS NULL) ASC, i.time ASC, i.position ASC`,
      [trip.trip_id],
    );

    let costGroup = null;
    if (trip.cost_group_id) {
      const { rows: [g] } = await query(`SELECT group_id, title FROM hive_cost_groups WHERE group_id = $1`, [trip.cost_group_id]);
      costGroup = g ?? null;
    }

    res.json({
      trip: shapeTrip(trip),
      costGroup,
      items: items.map(shapeItem),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/getTrip]', err);
    res.status(500).json({ error: 'Failed to load this trip.' });
  }
};

// ── PATCH /api/hives/:id/tools/itinerary/trips/:tripId ─────────────────────
export const updateTrip = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const existing = await loadTrip(hiveId, req.params.tripId);

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const destination = req.body?.destination !== undefined ? String(req.body.destination).trim() : existing.destination;
    if (destination.length < 1 || destination.length > 120) return res.status(400).json({ error: 'Destination must be 1-120 characters.' });
    const startsOn = req.body?.startsOn !== undefined ? req.body.startsOn : toDateStr(existing.starts_on);
    const endsOn = req.body?.endsOn !== undefined ? req.body.endsOn : toDateStr(existing.ends_on);
    if (!DATE_RE.test(String(startsOn))) return res.status(400).json({ error: 'startsOn must be a valid date.' });
    if (!DATE_RE.test(String(endsOn))) return res.status(400).json({ error: 'endsOn must be a valid date.' });
    if (endsOn < startsOn) return res.status(400).json({ error: 'The trip cannot end before it starts.' });
    const spanDays = (new Date(endsOn) - new Date(startsOn)) / 86400000;
    if (spanDays > 60) return res.status(400).json({ error: 'A trip can span at most 60 days.' });

    let costGroupId = existing.cost_group_id;
    if (req.body?.costGroupId !== undefined) {
      if (req.body.costGroupId) {
        const { rows: [g] } = await query(`SELECT group_id FROM hive_cost_groups WHERE group_id = $1 AND hive_id = $2`, [req.body.costGroupId, hiveId]);
        if (!g) return res.status(400).json({ error: 'That cost group does not belong to this Hive.' });
        costGroupId = g.group_id;
      } else {
        costGroupId = null;
      }
    }

    const { rows: [t] } = await query(
      `UPDATE hive_trips SET title=$1, destination=$2, starts_on=$3, ends_on=$4, cost_group_id=$5
        WHERE trip_id=$6 RETURNING *`,
      [title, destination, startsOn, endsOn, costGroupId, existing.trip_id],
    );
    broadcast(hiveId, { kind: 'trip_updated', trip_id: t.trip_id });
    res.json({ trip: shapeTrip(t) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/updateTrip]', err);
    res.status(500).json({ error: 'Failed to update this trip.' });
  }
};

// ── DELETE /api/hives/:id/tools/itinerary/trips/:tripId ────────────────────
// Archive, not a hard delete — a past trip's itinerary stays readable.
export const archiveTrip = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const existing = await loadTrip(hiveId, req.params.tripId);
    await query(`UPDATE hive_trips SET archived_at = NOW() WHERE trip_id = $1`, [existing.trip_id]);
    broadcast(hiveId, { kind: 'trip_archived', trip_id: existing.trip_id });
    res.json({ archived: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/archiveTrip]', err);
    res.status(500).json({ error: 'Failed to archive this trip.' });
  }
};

// ── POST /api/hives/:id/tools/itinerary/trips/:tripId/items ───────────────
export const createItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const trip = await loadTrip(hiveId, req.params.tripId);

    const day = req.body?.day;
    if (!DATE_RE.test(day ?? '')) return res.status(400).json({ error: 'day must be a valid date.' });
    const tripStart = toDateStr(trip.starts_on), tripEnd = toDateStr(trip.ends_on);
    if (day < tripStart || day > tripEnd) {
      return res.status(400).json({ error: `day must fall within the trip's dates (${tripStart} – ${tripEnd}).` });
    }
    const time = req.body?.time || null;
    if (time && !TIME_RE.test(time)) return res.status(400).json({ error: 'time must be HH:MM.' });
    const title = String(req.body?.title ?? '').trim();
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const location = req.body?.location ? String(req.body.location).trim().slice(0, 200) : null;
    const { url, error: urlError } = validateUrl(req.body?.url);
    if (urlError) return res.status(400).json({ error: urlError });
    const notes = String(req.body?.notes ?? '');
    if (notes.length > 1000) return res.status(400).json({ error: 'Notes must be 1000 characters or fewer.' });

    const { rows: [{ maxPos }] } = await query(
      `SELECT COALESCE(MAX(position), 0) AS "maxPos" FROM hive_trip_items WHERE trip_id = $1 AND day = $2`,
      [trip.trip_id, day],
    );

    const { rows: [item] } = await query(
      `INSERT INTO hive_trip_items (trip_id, day, time, title, location, url, notes, position, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [trip.trip_id, day, time, title, location, url, notes, Number(maxPos) + 1, req.userId],
    );
    broadcast(hiveId, { kind: 'item_created', trip_id: trip.trip_id, item_id: item.item_id });
    res.status(201).json({ item: shapeItem(item) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/createItem]', err);
    res.status(500).json({ error: 'Failed to add this item.' });
  }
};

async function loadItemWithTrip(hiveId, itemId) {
  const { rows: [i] } = await query(
    `SELECT i.*, t.hive_id, t.starts_on, t.ends_on
       FROM hive_trip_items i JOIN hive_trips t ON t.trip_id = i.trip_id
      WHERE i.item_id = $1 AND t.hive_id = $2`,
    [itemId, hiveId],
  );
  if (!i) { const err = new Error('Item not found.'); err.status = 404; throw err; }
  return i;
}

// ── PATCH /api/hives/:id/tools/itinerary/items/:itemId ─────────────────────
export const updateItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const existing = await loadItemWithTrip(hiveId, req.params.itemId);

    const day = req.body?.day !== undefined ? req.body.day : toDateStr(existing.day);
    if (!DATE_RE.test(String(day))) return res.status(400).json({ error: 'day must be a valid date.' });
    const tripStart = toDateStr(existing.starts_on), tripEnd = toDateStr(existing.ends_on);
    if (day < tripStart || day > tripEnd) {
      return res.status(400).json({ error: `day must fall within the trip's dates (${tripStart} – ${tripEnd}).` });
    }
    const time = req.body?.time !== undefined ? (req.body.time || null) : existing.time;
    if (time && !TIME_RE.test(time)) return res.status(400).json({ error: 'time must be HH:MM.' });
    const title = req.body?.title !== undefined ? String(req.body.title).trim() : existing.title;
    if (title.length < 1 || title.length > 120) return res.status(400).json({ error: 'Title must be 1-120 characters.' });
    const location = req.body?.location !== undefined ? (req.body.location ? String(req.body.location).trim().slice(0, 200) : null) : existing.location;
    let url = existing.url;
    if (req.body?.url !== undefined) {
      const v = validateUrl(req.body.url);
      if (v.error) return res.status(400).json({ error: v.error });
      url = v.url;
    }
    const notes = req.body?.notes !== undefined ? String(req.body.notes) : existing.notes;
    if (notes.length > 1000) return res.status(400).json({ error: 'Notes must be 1000 characters or fewer.' });

    const { rows: [item] } = await query(
      `UPDATE hive_trip_items SET day=$1, time=$2, title=$3, location=$4, url=$5, notes=$6, updated_at=NOW()
        WHERE item_id=$7 RETURNING *`,
      [day, time, title, location, url, notes, existing.item_id],
    );
    broadcast(hiveId, { kind: 'item_updated', trip_id: existing.trip_id, item_id: item.item_id });
    res.json({ item: shapeItem(item) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/updateItem]', err);
    res.status(500).json({ error: 'Failed to update this item.' });
  }
};

// ── DELETE /api/hives/:id/tools/itinerary/items/:itemId ────────────────────
export const deleteItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const existing = await loadItemWithTrip(hiveId, req.params.itemId);
    await query(`DELETE FROM hive_trip_items WHERE item_id = $1`, [existing.item_id]);
    broadcast(hiveId, { kind: 'item_deleted', trip_id: existing.trip_id, item_id: existing.item_id });
    res.json({ deleted: true });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/deleteItem]', err);
    res.status(500).json({ error: 'Failed to delete this item.' });
  }
};

// ── POST /api/hives/:id/tools/itinerary/items/:itemId/move ─────────────────
// body: { day, beforeItemId, afterItemId } — only this item's own day and
// position are written (fractional indexing, same guarantee as Task board).
export const moveItem = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await requireCanEditItinerary(hiveId, req.userId);
    const existing = await loadItemWithTrip(hiveId, req.params.itemId);

    const day = req.body?.day ?? toDateStr(existing.day);
    if (!DATE_RE.test(String(day))) return res.status(400).json({ error: 'day must be a valid date.' });
    const tripStart = toDateStr(existing.starts_on), tripEnd = toDateStr(existing.ends_on);
    if (day < tripStart || day > tripEnd) {
      return res.status(400).json({ error: `day must fall within the trip's dates (${tripStart} – ${tripEnd}).` });
    }

    let beforePos = null, afterPos = null;
    if (req.body?.beforeItemId) {
      const { rows: [b] } = await query(`SELECT position FROM hive_trip_items WHERE item_id = $1 AND trip_id = $2`, [req.body.beforeItemId, existing.trip_id]);
      beforePos = b ? Number(b.position) : null;
    }
    if (req.body?.afterItemId) {
      const { rows: [a] } = await query(`SELECT position FROM hive_trip_items WHERE item_id = $1 AND trip_id = $2`, [req.body.afterItemId, existing.trip_id]);
      afterPos = a ? Number(a.position) : null;
    }
    const newPosition = positionBetween(beforePos, afterPos);

    await query(`UPDATE hive_trip_items SET day=$1, position=$2, updated_at=NOW() WHERE item_id=$3`, [day, newPosition, existing.item_id]);
    broadcast(hiveId, { kind: 'item_moved', trip_id: existing.trip_id, item_id: existing.item_id, day, position: newPosition });
    res.json({ item_id: existing.item_id, day, position: newPosition });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[trips/moveItem]', err);
    res.status(500).json({ error: 'Failed to reorder this item.' });
  }
};

// ── Home / Chat rail: "Pinned Itinerary" (Prompt 66) ───────────────────────
// Today's items from the trip happening right now, or the first day's items
// from the soonest upcoming trip when none is happening today.
export async function getPinnedItineraryModule(hiveId) {
  const { rows: [current] } = await query(
    `SELECT * FROM hive_trips
      WHERE hive_id = $1 AND archived_at IS NULL
        AND starts_on <= CURRENT_DATE AND ends_on >= CURRENT_DATE
      ORDER BY starts_on ASC LIMIT 1`,
    [hiveId],
  );
  let trip = current;
  let day = current?.starts_on ?? null;
  if (current) {
    day = new Date().toISOString().slice(0, 10);
  } else {
    const { rows: [next] } = await query(
      `SELECT * FROM hive_trips
        WHERE hive_id = $1 AND archived_at IS NULL AND starts_on > CURRENT_DATE
        ORDER BY starts_on ASC LIMIT 1`,
      [hiveId],
    );
    trip = next;
    day = toDateStr(next?.starts_on);
  }
  if (!trip) return null;

  const { rows: items } = await query(
    `SELECT item_id, time, title, location, url
       FROM hive_trip_items WHERE trip_id = $1 AND day = $2
       ORDER BY (time IS NULL) ASC, time ASC, position ASC`,
    [trip.trip_id, day],
  );
  if (!items.length) return null;

  return {
    trip: { trip_id: trip.trip_id, title: trip.title, destination: trip.destination },
    day,
    isToday: !!current,
    items,
  };
}
