// Whether a tool is on, and the gate every tool endpoint sits behind
// (Prompt 61 Part 1). Off = 404 everywhere, not 403 — a disabled tool
// shouldn't even confirm it exists to someone probing the API.
import { query } from '../db/index.js';
import { getToolDef } from './toolCatalog.js';

export async function isToolOn(hiveId, key) {
  const def = getToolDef(key);
  if (!def || !def.available) return false;

  const { rows: [row] } = await query(
    `SELECT enabled FROM hive_tools WHERE hive_id = $1 AND tool_key = $2`,
    [hiveId, key],
  );
  if (row) return row.enabled;

  const { rows: [h] } = await query(
    `SELECT c.category_name FROM hives h
       LEFT JOIN categories c ON c.category_id = h.category_id
      WHERE h.hive_id = $1`,
    [hiveId],
  );
  return def.defaultOn.includes(h?.category_name ?? '');
}

// A tool's per-Hive settings override (e.g. docs' editors: owners|members).
// {} when no override row exists yet — callers apply their own default.
export async function getToolSettings(hiveId, key) {
  const { rows: [row] } = await query(
    `SELECT settings FROM hive_tools WHERE hive_id = $1 AND tool_key = $2`,
    [hiveId, key],
  );
  return row?.settings ?? {};
}

// req.params.id must be the hive id — every tools route is mounted under
// /api/hives/:id/... .
export function requireTool(key) {
  return async (req, res, next) => {
    try {
      const on = await isToolOn(req.params.id, key);
      if (!on) return res.status(404).json({ error: 'This tool is turned off in this Hive.' });
      next();
    } catch (err) {
      console.error('[hiveTools/requireTool]', err);
      res.status(500).json({ error: 'Failed to check this tool.' });
    }
  };
}
