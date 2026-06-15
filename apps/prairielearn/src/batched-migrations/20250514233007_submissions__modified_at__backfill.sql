-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  submissions;

-- BLOCK update_submissions_modified_at
UPDATE submissions
SET
  modified_at = COALESCE(graded_at, date)
WHERE
  modified_at IS NULL
  AND id >= $start
  AND id <= $end;
