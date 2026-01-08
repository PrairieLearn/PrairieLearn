-- BLOCK select_bounds
WITH
  null_assessments AS (
    SELECT
      id
    FROM
      assessments
    WHERE
      team_work IS NULL
  )
SELECT
  MIN(id) AS min,
  MAX(id) AS max
FROM
  null_assessments;

-- BLOCK backfill_team_work
UPDATE assessments
SET
  team_work = FALSE
WHERE
  team_work IS NULL
  AND id >= $start
  AND id <= $end;
