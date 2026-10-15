-- One-time: derive hives.metro_key from hives.location for every existing
-- in-person/hybrid Hive, using the exact same rules as lib/metros.js's
-- resolveMetro() — "City, ST" or a bare city name; a bare city that matches
-- more than one state is left NULL rather than guessed.
WITH parsed AS (
  SELECT
    h.hive_id,
    h.location,
    CASE WHEN h.location ~ '^(.*?),?\s+([A-Za-z]{2})$'
         THEN trim(regexp_replace(h.location, '^(.*?),?\s+([A-Za-z]{2})$', '\1'))
         ELSE trim(h.location)
    END AS city_part,
    CASE WHEN h.location ~ '^(.*?),?\s+([A-Za-z]{2})$'
         THEN upper(regexp_replace(h.location, '^(.*?),?\s+([A-Za-z]{2})$', '\2'))
         ELSE NULL
    END AS state_part
  FROM hives h
  WHERE h.location IS NOT NULL AND trim(h.location) <> ''
    AND h.location_type IN ('in-person', 'hybrid')
    AND h.metro_key IS NULL
),
resolved AS (
  SELECT
    p.hive_id,
    CASE
      WHEN p.state_part IS NOT NULL THEN (
        SELECT mp.metro_key FROM metro_places mp
         WHERE mp.place_key = normalize_place(p.city_part) || '|' || lower(p.state_part)
         LIMIT 1
      )
      ELSE (
        SELECT CASE WHEN COUNT(DISTINCT mp.state_code) = 1 AND COUNT(DISTINCT mp.metro_key) = 1
                    THEN MIN(mp.metro_key) END
          FROM metro_places mp
         WHERE mp.place_key LIKE normalize_place(p.city_part) || '|%'
      )
    END AS resolved_metro_key
  FROM parsed p
)
UPDATE hives h
   SET metro_key = r.resolved_metro_key, updated_at = h.updated_at
  FROM resolved r
 WHERE h.hive_id = r.hive_id AND r.resolved_metro_key IS NOT NULL;
