-- Prompt 86: connect everyone who is already an active co-member of a Hive.
--
-- From now on the hive_members_connect trigger (schema.sql) does this as
-- people join; this file covers the memberships that existed before it.
--
-- Two guards, on purpose. migrate.js runs this file once and records it in
-- schema_migrations; the app_flags row is a second guard so that copying this
-- block anywhere re-runnable (or deleting the schema_migrations row) still
-- can't run it twice. A second run would be mostly harmless here (ON CONFLICT
-- DO NOTHING), but it would re-connect pairs who removed each other since,
-- which is exactly the kind of silent effect CLAUDE.md warns about.
--
-- Same filters as the trigger: system accounts (the house account that owns
-- starter Hives) are never connected, nor are blocked or removed pairs.
-- Counts are raised as NOTICEs, which migrate.js prints.

DO $$
DECLARE
  n_conn INT;
  n_src  INT;
BEGIN
  IF EXISTS (SELECT 1 FROM app_flags WHERE key = 'connections_backfilled_v1') THEN
    RAISE NOTICE 'connections backfill: flag connections_backfilled_v1 already set, skipped';
    RETURN;
  END IF;

  INSERT INTO user_connections (user_a, user_b)
  SELECT DISTINCT a.user_id, b.user_id
    FROM hive_members a
    JOIN hive_members b ON b.hive_id = a.hive_id AND a.user_id < b.user_id
    JOIN users ua ON ua.user_id = a.user_id AND NOT ua.is_system
    JOIN users ub ON ub.user_id = b.user_id AND NOT ub.is_system
   WHERE a.membership_status = 'active'
     AND b.membership_status = 'active'
     AND NOT EXISTS (SELECT 1 FROM user_blocks x
                      WHERE (x.blocker_id = a.user_id AND x.blocked_id = b.user_id)
                         OR (x.blocker_id = b.user_id AND x.blocked_id = a.user_id))
     AND NOT EXISTS (SELECT 1 FROM user_connection_removals r
                      WHERE (r.remover_id = a.user_id AND r.other_id = b.user_id)
                         OR (r.remover_id = b.user_id AND r.other_id = a.user_id))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_conn = ROW_COUNT;

  INSERT INTO user_connection_sources (user_a, user_b, hive_id)
  SELECT a.user_id, b.user_id, a.hive_id
    FROM hive_members a
    JOIN hive_members b ON b.hive_id = a.hive_id AND a.user_id < b.user_id
    JOIN user_connections c ON c.user_a = a.user_id AND c.user_b = b.user_id
   WHERE a.membership_status = 'active'
     AND b.membership_status = 'active'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n_src = ROW_COUNT;

  INSERT INTO app_flags (key) VALUES ('connections_backfilled_v1');

  RAISE NOTICE 'connections backfill: % connections, % source rows created', n_conn, n_src;
END $$;
