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
  AND id >= $start
  AND id <= $end;
