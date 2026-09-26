-- One-time: attach messages written before channels existed to their hive's
-- default channel, so no message is orphaned.
--
-- Was inline in schema.sql. It WRITES DATA, and the `channel_id IS NULL` guard
-- has the same shape as the welcome backfill: it matches any future message
-- that lacks a channel, not only the historical ones. If a code path ever
-- writes a message without a channel_id, this would quietly reassign it to
-- #general on the next deploy rather than letting the bug show.
--
-- Applied against production 2026-09-25; 0 rows needed it by then.

UPDATE messages m
SET    channel_id = c.channel_id
FROM   hive_channels c
WHERE  c.hive_id   = m.hive_id
  AND  c.is_default
  AND  m.channel_id IS NULL;
