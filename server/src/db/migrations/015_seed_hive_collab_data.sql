-- Prompt 84 — real collab data for the 10 starter Project/Professional Hives
-- (Pro & Project plan, Step 9). Matches by (hive_name, is_seed = TRUE), so a
-- real Hive that happens to share one of these names is never touched.
--
-- Idempotent by construction, not just by intent:
--   - basics: each column only overwrites its own NULL (TEXT) or '[]' (JSONB)
--     default — a column that already holds data is left alone, so running
--     this twice, or after an owner has edited one of these Hives, is safe.
--   - roles: INSERT … SELECT … WHERE NOT EXISTS on (hive_id, lower(title)) —
--     a role already present (by title, case-insensitive) is never duplicated.

-- ── Project Collaboration basics ─────────────────────────────────────────
UPDATE hives AS h SET
  project_types      = CASE WHEN h.project_types      = '[]'::jsonb THEN v.project_types      ELSE h.project_types      END,
  project_stage      = COALESCE(h.project_stage, v.project_stage),
  commitment         = COALESCE(h.commitment,    v.commitment),
  work_style         = COALESCE(h.work_style,    v.work_style),
  project_timeline   = COALESCE(h.project_timeline, v.project_timeline),
  compensation       = CASE WHEN h.compensation       = '[]'::jsonb THEN v.compensation       ELSE h.compensation       END,
  project_industries = CASE WHEN h.project_industries = '[]'::jsonb THEN v.project_industries ELSE h.project_industries END
FROM (VALUES
  ('Build a Fitness App MVP in 90 Days', '["app_software"]'::jsonb,  'in_progress', 'side_project', 'weekly_sync', 'few_months', '["equity","portfolio"]'::jsonb,        '["tech_software","health_wellness"]'::jsonb),
  ('Indie Short Film — Crew Wanted',     '["film_video"]'::jsonb,    'in_progress', 'side_project', 'weekly_sync', 'few_months', '["portfolio","revenue_share"]'::jsonb, '["film_entertainment"]'::jsonb),
  ('South LA Community Garden Project',  '["social_impact"]'::jsonb,'idea',        'casual',       'flexible',    'long_term',   '["unpaid"]'::jsonb,                     '["social_impact_nonprofit"]'::jsonb),
  ('True Crime Podcast Co-Hosts',        '["podcast"]'::jsonb,       'idea',        'side_project', 'weekly_sync', 'long_term',   '["revenue_share","portfolio"]'::jsonb, '["social_media_content"]'::jsonb),
  ('48-Hour Game Jam Team',              '["game_studio"]'::jsonb,   'idea',        'part_time',    'sprints',     'sprint',      '["portfolio"]'::jsonb,                 '["gaming_interactive"]'::jsonb)
) AS v(hive_name, project_types, project_stage, commitment, work_style, project_timeline, compensation, project_industries)
WHERE h.hive_name = v.hive_name AND h.is_seed = TRUE;

-- ── Project Collaboration roles ──────────────────────────────────────────
INSERT INTO hive_roles (hive_id, title, slots, skills, experience_level, position)
SELECT h.hive_id, v.title, v.slots, v.skills::jsonb, v.experience_level, v.position
FROM hives h
JOIN (VALUES
  ('Build a Fitness App MVP in 90 Days', 'UI/UX designer',     1, '["🖥️ UI / UX Design"]',                           NULL::text, 0),
  ('Build a Fitness App MVP in 90 Days', 'Marketer',           1, '["📱 Social Media Marketing"]',                   NULL::text, 1),
  ('Build a Fitness App MVP in 90 Days', 'Backend developer',  1, '["🗄️ Backend / APIs"]',                           NULL::text, 2),
  ('Indie Short Film — Crew Wanted',     'Cinematographer',    1, '["📸 Photography"]',                              'some'::text, 0),
  ('Indie Short Film — Crew Wanted',     'Editor',             1, '["📹 Video Editing"]',                            NULL::text, 1),
  ('Indie Short Film — Crew Wanted',     'Actor',              2, '["🎭 Acting / Theater","🎬 Film / TV Acting"]',   NULL::text, 2),
  ('Indie Short Film — Crew Wanted',     'Sound mixer',        1, '["🎚️ Mixing / Mastering"]',                       NULL::text, 3),
  ('South LA Community Garden Project',  'Community organizer',2, '["📣 Advocacy / Community Organizing"]',          NULL::text, 0),
  ('South LA Community Garden Project',  'Fundraiser',         1, '["📝 Grant Writing"]',                            NULL::text, 1),
  ('South LA Community Garden Project',  'Volunteer coordinator', 1, '["🤝 Social Work"]',                           NULL::text, 2),
  ('True Crime Podcast Co-Hosts',        'Co-host',            1, '["🎙️ Podcasting"]',                              NULL::text, 0),
  ('True Crime Podcast Co-Hosts',        'Audio editor',       1, '["🎙️ Audio Engineering"]',                       NULL::text, 1),
  ('48-Hour Game Jam Team',              'Game developer',     2, '["🎮 Game Dev"]',                                 NULL::text, 0),
  ('48-Hour Game Jam Team',              '2D / pixel artist',  1, '["🖼️ Illustration"]',                            NULL::text, 1),
  ('48-Hour Game Jam Team',              'Sound designer',     1, '["🎙️ Audio Engineering"]',                       NULL::text, 2)
) AS v(hive_name, title, slots, skills, experience_level, position)
  ON v.hive_name = h.hive_name AND h.is_seed = TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM hive_roles hr WHERE hr.hive_id = h.hive_id AND lower(hr.title) = lower(v.title)
);

-- ── Professional Networking basics ───────────────────────────────────────
UPDATE hives AS h SET
  pro_industries = CASE WHEN h.pro_industries = '[]'::jsonb THEN v.pro_industries ELSE h.pro_industries END,
  career_stages  = CASE WHEN h.career_stages  = '[]'::jsonb THEN v.career_stages  ELSE h.career_stages  END,
  audience_scope = COALESCE(h.audience_scope, v.audience_scope)
FROM (VALUES
  ('LA Design Critique Circle',     '["design_and_creative"]'::jsonb,              '["early","mid"]'::jsonb,     'same'),
  ('Black Women Founders LA',       '["startups"]'::jsonb,                         '[]'::jsonb,                   'cross'),
  ('New Grad SWE Accountability',   '["tech_software"]'::jsonb,                    '["student","early"]'::jsonb, 'same'),
  ('Clinical to Corporate',         '["healthcare","consulting"]'::jsonb,          '["mid","senior"]'::jsonb,    'cross'),
  ('Indie Post-Production Network','["film_and_media","entertainment"]'::jsonb,   '["early","mid"]'::jsonb,     'same')
) AS v(hive_name, pro_industries, career_stages, audience_scope)
WHERE h.hive_name = v.hive_name AND h.is_seed = TRUE;
