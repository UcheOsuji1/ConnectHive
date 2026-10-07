import { query } from '../db/index.js';
import { getMembership } from '../lib/hiveMembership.js';
import { TOOL_CATALOG, publicCatalog } from '../lib/toolCatalog.js';

// GET /api/tools/catalog — static, no DB needed.
export const getToolCatalog = (_req, res) => {
  res.json({ catalog: publicCatalog() });
};

// GET /api/hives/:id/tools
// Members: the enabled, available tools only (what they can actually use).
// Owners/admins: every available tool with its current on/off state, so the
// Tools hub can be built the same shape for both — just filtered differently.
export const getHiveTools = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem) return res.status(403).json({ error: 'You must be a member of this Hive.' });
    const isOwnerOrAdmin = ['owner', 'admin'].includes(mem.role);

    const { rows: [h] } = await query(
      `SELECT c.category_name FROM hives h
         LEFT JOIN categories c ON c.category_id = h.category_id
        WHERE h.hive_id = $1`,
      [hiveId],
    );
    const categoryName = h?.category_name ?? null;

    const { rows: toolRows } = await query(
      `SELECT tool_key, enabled, settings FROM hive_tools WHERE hive_id = $1`,
      [hiveId],
    );
    const overrides = Object.fromEntries(toolRows.map(r => [r.tool_key, r]));

    const available = TOOL_CATALOG.filter(t => t.available);
    const shaped = available.map(t => {
      const override = overrides[t.key];
      const enabled = override ? override.enabled : t.defaultOn.includes(categoryName ?? '');
      return {
        key: t.key, name: t.name, description: t.description, icon: t.icon, scope: t.scope,
        enabled,
        isDefault: !override,
        recommended: t.defaultOn.includes(categoryName ?? ''),
        settings: override?.settings ?? {},
      };
    });

    const tools = isOwnerOrAdmin ? shaped : shaped.filter(t => t.enabled);
    res.json({ tools });
  } catch (err) {
    console.error('[tools/getHiveTools]', err);
    res.status(500).json({ error: 'Failed to load tools.' });
  }
};

// PUT /api/hives/:id/tools/:key — owner/admin only.
export const updateHiveTool = async (req, res) => {
  try {
    const hiveId = req.params.id;
    const key = req.params.key;
    const mem = await getMembership(hiveId, req.userId);
    if (!mem || !['owner', 'admin'].includes(mem.role)) {
      return res.status(403).json({ error: 'Only owners and admins can change a Hive\'s tools.' });
    }

    const def = TOOL_CATALOG.find(t => t.key === key);
    if (!def || !def.available) return res.status(404).json({ error: 'That tool does not exist.' });

    const { enabled, settings } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled must be true or false.' });
    }

    let nextSettings = {};
    if (settings !== undefined) {
      if (typeof def.validateSettings === 'function') {
        const result = def.validateSettings(settings);
        if (result.error) return res.status(400).json({ error: result.error });
        nextSettings = result.settings;
      } else if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        nextSettings = settings;
      } else {
        return res.status(400).json({ error: 'settings must be an object.' });
      }
    }

    await query(
      `INSERT INTO hive_tools (hive_id, tool_key, enabled, settings, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (hive_id, tool_key) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         settings = CASE WHEN $6 THEN EXCLUDED.settings ELSE hive_tools.settings END,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [hiveId, key, enabled, JSON.stringify(nextSettings), req.userId, settings !== undefined],
    );

    res.json({ key, enabled, settings: nextSettings });
  } catch (err) {
    console.error('[tools/updateHiveTool]', err);
    res.status(500).json({ error: 'Failed to update this tool.' });
  }
};
