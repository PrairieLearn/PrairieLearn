-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  enrollments;

-- BLOCK update_enrollments_first_joined_at
UPDATE enrollments
SET
  first_joined_at = joined_at
WHERE
  joined_at IS NOT NULL
  AND first_joined_at IS NULL
  AND id >= $start
  AND id <= $end;
