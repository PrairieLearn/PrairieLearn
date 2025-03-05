-- BLOCK select_bounds
--
-- Note that Postgres generates a bad query plan if we try to do the select
-- directly. We use a CTE to trick it into generating a faster plan.
WITH
  null_variants AS (
    SELECT
      id
    FROM
      variants
    WHERE
      authn_user_id IS NULL
  )
SELECT
  MIN(id) AS min,
  MAX(id) AS max
FROM
  null_variants;

-- BLOCK backfill_authn_user_id
UPDATE variants
SET
  authn_user_id = user_id
WHERE
  authn_user_id IS NULL
  AND id >= $start
  AND id <= $end;
