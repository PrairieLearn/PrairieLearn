-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessments;

-- BLOCK update_assessments_multiple_instance
UPDATE assessments
SET
  multiple_instance = false
WHERE
  multiple_instance IS NULL
  AND id >= $start
  AND id <= $end;
