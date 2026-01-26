-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  enrollments;

-- BLOCK update_enrollments_removed_to_left
UPDATE enrollments
SET
  status = 'left'
WHERE
  status = 'removed'
  AND id >= $start
  AND id <= $end;
