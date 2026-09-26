-- One-time: give every pre-existing hive a TH- code.
--
-- Was inline in schema.sql. Moved here because it WRITES DATA: the
-- `WHERE hive_code IS NULL` guard makes it look re-runnable, but the guard
-- matches whatever is null at the time, not only the rows it was written for.
-- In practice hives.hive_code now has a DEFAULT and a NOT NULL constraint, so
-- this should never match again — but that is a property of the schema, not of
-- this statement, and it does not belong in a file that runs on every deploy.
--
-- Applied against production 2026-09-25 as part of the consent-column
-- migration; all 22 hives were coded.

DO $$
DECLARE
  r        RECORD;
  new_code TEXT;
BEGIN
  FOR r IN SELECT hive_id FROM hives WHERE hive_code IS NULL LOOP
    LOOP
      new_code := generate_hive_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM hives WHERE hive_code = new_code);
    END LOOP;
    UPDATE hives SET hive_code = new_code WHERE hive_id = r.hive_id;
  END LOOP;
END $$;

-- Only valid once every row has a code, so it belongs with the backfill rather
-- than in schema.sql.
ALTER TABLE hives ALTER COLUMN hive_code SET NOT NULL;
