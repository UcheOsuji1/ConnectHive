-- Proves the runner applies an unseen migration exactly once and skips it
-- thereafter. Creates and drops its own scratch table, so it touches no
-- application data. Safe to leave in the repo: on any database that has not
-- seen it, it is a no-op with a recorded name.
CREATE TABLE IF NOT EXISTS _migration_runner_probe (
  id          INT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO _migration_runner_probe (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
DROP TABLE _migration_runner_probe;
