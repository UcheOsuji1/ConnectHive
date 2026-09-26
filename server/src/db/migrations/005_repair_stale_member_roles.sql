-- One-time: demote elevated roles left on non-active membership rows by
-- removeMember and leaveHive, before those handlers reset role correctly.
--
-- Was inline in schema.sql. It WRITES DATA. This one is the closest to
-- genuinely idempotent — once the handlers are fixed nothing recreates the bad
-- state — but that is exactly why it should not run forever: if the handlers
-- regress, a repair on every deploy hides the regression instead of letting it
-- be noticed. A repair statement should run once, against a known-bad dataset,
-- and then be retired.
--
-- Applied against production 2026-09-25; 0 rows needed it by then.

UPDATE hive_members SET role = 'member'
WHERE membership_status <> 'active' AND role <> 'member';
