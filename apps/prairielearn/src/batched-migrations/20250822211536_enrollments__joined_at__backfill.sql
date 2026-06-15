-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  enrollments;

-- BLOCK update_enrollments_joined_at
UPDATE enrollments
SET
  joined_at = created_at
WHERE
  joined_at IS NULL
  AND created_at IS NOT NULL
  AND status = 'joined'
  AND id >= $start
  AND id <= $end;
