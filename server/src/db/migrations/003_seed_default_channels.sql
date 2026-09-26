-- One-time: give every hive that predates hive_channels a default #general.
--
-- Was inline in schema.sql. It WRITES DATA. The NOT EXISTS guard means it is
-- harmless to repeat today, but it is not inert: any hive that ends up without
-- a default channel later — a bug in hive creation, a channel archived or
-- deleted — would silently acquire a fresh #general on the next deploy,
-- masking the actual fault instead of surfacing it.
--
-- Applied against production 2026-09-25; 1 hive still needed a channel, which
-- suggests hive creation does not always create one. Worth checking separately
-- rather than leaving this statement to paper over it on every deploy.

INSERT INTO hive_channels (hive_id, name, channel_type, is_default, position)
SELECT h.hive_id, 'general', 'text', TRUE, 0
FROM hives h
WHERE NOT EXISTS (
  SELECT 1 FROM hive_channels c WHERE c.hive_id = h.hive_id AND c.is_default
);
