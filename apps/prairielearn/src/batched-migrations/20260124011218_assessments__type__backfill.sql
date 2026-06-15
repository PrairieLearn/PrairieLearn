-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessments;

-- BLOCK update_assessments_type
UPDATE assessments
SET
  type = 'Homework'
WHERE
  type IS NULL
  AND id >= $start
  AND id <= $end;
