import { query } from '../db/index.js';

// ── Default step templates (lazy-seeded per hive on first GET) ────────────────
const DEFAULT_STEPS = [
  { title: 'Read mission & values',        description: 'Learn what this Hive stands for and what brings us together.',  is_required: true,  step_type: 'read' },
  { title: 'Review community guidelines',  description: 'Familiarise yourself with the rules that keep our Hive healthy.', is_required: true,  step_type: 'read' },
  { title: 'Introduce yourself',           description: 'Post a quick hello so the community knows you\'re here.',         is_required: true,  step_type: 'task' },
  { title: 'Pick channels & interests',    description: 'Tell us what topics you\'d like to follow inside the Hive.',      is_required: true,  step_type: 'task' },
  { title: 'RSVP to orientation',          description: 'Optional: join our next welcome session to meet the community.',   is_required: false, step_type: 'task' },
  { title: 'Complete member profile',      description: 'Add a photo and fill in your bio so others can get to know you.', is_required: true,  step_type: 'task' },
];

// Helper: check caller is owner or admin of the hive
async function assertOwnerOrAdmin(hiveId, userId) {
  const { rows: [mem] } = await query(
    `SELECT role FROM hive_members
     WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
    [hiveId, userId],
  );
  if (!mem || !['owner', 'admin'].includes(mem.role)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
}

// Helper: fetch fresh steps for a hive, ordered
async function fetchSteps(hiveId) {
  const { rows } = await query(
    `SELECT * FROM hive_onboarding_steps WHERE hive_id = $1 ORDER BY step_order, created_at`,
    [hiveId],
  );
  return rows;
}

// Helper: ensure settings + default steps exist; returns { settings, steps }
async function ensureOnboarding(hiveId) {
  // Upsert settings row
  const { rows: [settings] } = await query(
    `INSERT INTO hive_onboarding_settings (hive_id)
     VALUES ($1)
     ON CONFLICT (hive_id) DO UPDATE SET updated_at = hive_onboarding_settings.updated_at
     RETURNING *`,
    [hiveId],
  );

  // Lazy-seed default steps only if not already seeded (steps_seeded guards against re-seeding)
  if (!settings.steps_seeded) {
    const { rows: existing } = await query(
      `SELECT step_id FROM hive_onboarding_steps WHERE hive_id = $1 LIMIT 1`,
      [hiveId],
    );
    if (!existing.length) {
      for (let i = 0; i < DEFAULT_STEPS.length; i++) {
        const s = DEFAULT_STEPS[i];
        await query(
          `INSERT INTO hive_onboarding_steps
             (hive_id, title, description, is_required, step_order, step_type)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [hiveId, s.title, s.description, s.is_required, i, s.step_type],
        );
      }
    }
    await query(
      `UPDATE hive_onboarding_settings SET steps_seeded = TRUE WHERE hive_id = $1`,
      [hiveId],
    );
    settings.steps_seeded = true;
  }

  const steps = await fetchSteps(hiveId);
  return { settings, steps };
}

// ── GET /api/hives/:id/onboarding ─────────────────────────────────────────────
export const getOnboarding = async (req, res) => {
  try {
    const hiveId = req.params.id;

    // Any active member may view
    const { rows: [mem] } = await query(
      `SELECT role FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this Hive.' });

    const { settings, steps } = await ensureOnboarding(hiveId);
    res.json({ settings, steps });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/getOnboarding]', err);
    res.status(500).json({ error: 'Failed to load onboarding settings.' });
  }
};

// ── PUT /api/hives/:id/onboarding ─────────────────────────────────────────────
export const updateOnboarding = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await assertOwnerOrAdmin(hiveId, req.userId);

    const {
      join_experience, welcome_message, show_welcome_banner,
      show_owner_note, require_photo, send_welcome_notif, completion_unlocks,
    } = req.body;

    // Ensure row exists first
    await ensureOnboarding(hiveId);

    const { rows: [settings] } = await query(
      `UPDATE hive_onboarding_settings SET
         join_experience     = COALESCE($2, join_experience),
         welcome_message     = COALESCE($3, welcome_message),
         show_welcome_banner = COALESCE($4, show_welcome_banner),
         show_owner_note     = COALESCE($5, show_owner_note),
         require_photo       = COALESCE($6, require_photo),
         send_welcome_notif  = COALESCE($7, send_welcome_notif),
         completion_unlocks  = COALESCE($8, completion_unlocks),
         updated_at          = NOW()
       WHERE hive_id = $1
       RETURNING *`,
      [hiveId, join_experience ?? null, welcome_message ?? null,
       show_welcome_banner ?? null, show_owner_note ?? null,
       require_photo ?? null, send_welcome_notif ?? null,
       completion_unlocks ?? null],
    );

    const steps = await fetchSteps(hiveId);
    res.json({ settings, steps });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/updateOnboarding]', err);
    res.status(500).json({ error: 'Failed to update onboarding settings.' });
  }
};

// ── POST /api/hives/:id/onboarding/steps ──────────────────────────────────────
export const createStep = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await assertOwnerOrAdmin(hiveId, req.userId);

    const { title, description, is_required = true, step_type = 'task', link_url } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Step title is required.' });

    // Place at the end
    const { rows: [{ max_order }] } = await query(
      `SELECT COALESCE(MAX(step_order), -1) AS max_order FROM hive_onboarding_steps WHERE hive_id = $1`,
      [hiveId],
    );

    const { rows: [step] } = await query(
      `INSERT INTO hive_onboarding_steps
         (hive_id, title, description, is_required, step_order, step_type, link_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [hiveId, title.trim(), description ?? null, is_required, Number(max_order) + 1, step_type, link_url ?? null],
    );

    const steps = await fetchSteps(hiveId);
    res.status(201).json({ step, steps });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/createStep]', err);
    res.status(500).json({ error: 'Failed to create step.' });
  }
};

// ── PUT /api/hives/:id/onboarding/steps/:stepId ───────────────────────────────
export const updateStep = async (req, res) => {
  try {
    const { id: hiveId, stepId } = req.params;
    await assertOwnerOrAdmin(hiveId, req.userId);

    const { title, description, is_required, step_type, link_url } = req.body;

    const { rows: [step] } = await query(
      `UPDATE hive_onboarding_steps SET
         title        = COALESCE($3, title),
         description  = COALESCE($4, description),
         is_required  = COALESCE($5, is_required),
         step_type    = COALESCE($6, step_type),
         link_url     = COALESCE($7, link_url),
         updated_at   = NOW()
       WHERE step_id = $1 AND hive_id = $2
       RETURNING *`,
      [stepId, hiveId, title ?? null, description ?? null,
       is_required ?? null, step_type ?? null, link_url ?? null],
    );
    if (!step) return res.status(404).json({ error: 'Step not found.' });

    const steps = await fetchSteps(hiveId);
    res.json({ step, steps });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/updateStep]', err);
    res.status(500).json({ error: 'Failed to update step.' });
  }
};

// ── DELETE /api/hives/:id/onboarding/steps/:stepId ───────────────────────────
export const deleteStep = async (req, res) => {
  try {
    const { id: hiveId, stepId } = req.params;
    await assertOwnerOrAdmin(hiveId, req.userId);

    await query(
      `DELETE FROM hive_onboarding_steps WHERE step_id = $1 AND hive_id = $2`,
      [stepId, hiveId],
    );

    // Re-number remaining steps sequentially
    const remaining = await fetchSteps(hiveId);
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].step_order !== i) {
        await query(
          `UPDATE hive_onboarding_steps SET step_order = $1 WHERE step_id = $2`,
          [i, remaining[i].step_id],
        );
        remaining[i].step_order = i;
      }
    }

    res.json({ steps: remaining });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/deleteStep]', err);
    res.status(500).json({ error: 'Failed to delete step.' });
  }
};

// ── POST /api/hives/:id/onboarding/steps/reorder ─────────────────────────────
// Body: { order: [stepId, stepId, ...] }
export const reorderSteps = async (req, res) => {
  try {
    const hiveId = req.params.id;
    await assertOwnerOrAdmin(hiveId, req.userId);

    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of step IDs.' });

    for (let i = 0; i < order.length; i++) {
      await query(
        `UPDATE hive_onboarding_steps SET step_order = $1
         WHERE step_id = $2 AND hive_id = $3`,
        [i, order[i], hiveId],
      );
    }

    const steps = await fetchSteps(hiveId);
    res.json({ steps });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/reorderSteps]', err);
    res.status(500).json({ error: 'Failed to reorder steps.' });
  }
};

// ── GET /api/hives/:id/onboarding/me ─────────────────────────────────────────
// Returns steps + which ones the calling member has completed
export const getMyProgress = async (req, res) => {
  try {
    const hiveId = req.params.id;

    const { rows: [mem] } = await query(
      `SELECT onboarding_status, onboarding_started_at, onboarding_completed_at
       FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this Hive.' });

    const { settings, steps } = await ensureOnboarding(hiveId);

    const { rows: completed } = await query(
      `SELECT step_id, completed_at FROM member_onboarding_progress
       WHERE hive_id = $1 AND user_id = $2`,
      [hiveId, req.userId],
    );
    const completedMap = Object.fromEntries(completed.map(r => [r.step_id, r.completed_at]));

    const stepsWithProgress = steps.map(s => ({
      ...s,
      completed: !!completedMap[s.step_id],
      completed_at: completedMap[s.step_id] ?? null,
    }));

    const total    = steps.length;
    const done     = completed.length;
    const required = steps.filter(s => s.is_required);
    const reqDone  = required.filter(s => !!completedMap[s.step_id]).length;

    res.json({
      onboarding_status:         mem.onboarding_status,
      onboarding_started_at:     mem.onboarding_started_at,
      onboarding_completed_at:   mem.onboarding_completed_at,
      settings,
      steps:                     stepsWithProgress,
      progress: { total, done, required: required.length, required_done: reqDone },
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/getMyProgress]', err);
    res.status(500).json({ error: 'Failed to load onboarding progress.' });
  }
};

// ── POST /api/hives/:id/onboarding/steps/:stepId/complete ─────────────────────
export const completeStep = async (req, res) => {
  try {
    const { id: hiveId, stepId } = req.params;

    const { rows: [mem] } = await query(
      `SELECT onboarding_status FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this Hive.' });

    // Start onboarding if not yet started
    if (mem.onboarding_status === 'pending') {
      await query(
        `UPDATE hive_members SET onboarding_status = 'in_progress', onboarding_started_at = NOW()
         WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, req.userId],
      );
    }

    await query(
      `INSERT INTO member_onboarding_progress (hive_id, user_id, step_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [hiveId, req.userId, stepId],
    );

    // Check if all required steps are now done → mark completed
    const { rows: [{ all_req_done }] } = await query(
      `SELECT NOT EXISTS (
         SELECT 1 FROM hive_onboarding_steps s
         WHERE s.hive_id = $1 AND s.is_required = true
           AND NOT EXISTS (
             SELECT 1 FROM member_onboarding_progress p
             WHERE p.hive_id = $1 AND p.user_id = $2 AND p.step_id = s.step_id
           )
       ) AS all_req_done`,
      [hiveId, req.userId],
    );

    if (all_req_done) {
      await query(
        `UPDATE hive_members
         SET onboarding_status = 'completed', onboarding_completed_at = NOW()
         WHERE hive_id = $1 AND user_id = $2 AND onboarding_status != 'completed'`,
        [hiveId, req.userId],
      );
    }

    res.json({ completed: true, all_required_done: all_req_done });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/completeStep]', err);
    res.status(500).json({ error: 'Failed to mark step complete.' });
  }
};

// ── DELETE /api/hives/:id/onboarding/steps/:stepId/complete ──────────────────
export const uncompleteStep = async (req, res) => {
  try {
    const { id: hiveId, stepId } = req.params;

    const { rows: [mem] } = await query(
      `SELECT onboarding_status FROM hive_members
       WHERE hive_id = $1 AND user_id = $2 AND membership_status = 'active'`,
      [hiveId, req.userId],
    );
    if (!mem) return res.status(403).json({ error: 'Not a member of this Hive.' });

    await query(
      `DELETE FROM member_onboarding_progress
       WHERE hive_id = $1 AND user_id = $2 AND step_id = $3`,
      [hiveId, req.userId, stepId],
    );

    // If was completed, revert to in_progress
    if (mem.onboarding_status === 'completed') {
      await query(
        `UPDATE hive_members
         SET onboarding_status = 'in_progress', onboarding_completed_at = NULL
         WHERE hive_id = $1 AND user_id = $2`,
        [hiveId, req.userId],
      );
    }

    res.json({ completed: false });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[onboarding/uncompleteStep]', err);
    res.status(500).json({ error: 'Failed to undo step completion.' });
  }
};
