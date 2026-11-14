import { query } from '../db/index.js';
import { CATEGORY_CONFIG, PROJECT_ROOMS_BY_TYPE } from '../lib/categoryConfig.js';

// GET /api/categories/config — category_name -> { defaultRooms, planTypes,
// labels, railModule }, so the client never hand-maintains a second copy of
// server/src/lib/categoryConfig.js. projectRoomsByType rides alongside it
// (Prompt 83, Step 8) — the starter-rooms mapping keyed by project type.
export const getCategoryConfig = async (req, res) => {
  try {
    const { rows } = await query('SELECT category_name FROM categories');
    const config = {};
    for (const { category_name } of rows) {
      config[category_name] = CATEGORY_CONFIG[category_name] ?? null;
    }
    res.json({ config, projectRoomsByType: PROJECT_ROOMS_BY_TYPE });
  } catch (err) {
    console.error('[categories/getCategoryConfig]', err);
    res.status(500).json({ error: 'Failed to load category config.' });
  }
};
