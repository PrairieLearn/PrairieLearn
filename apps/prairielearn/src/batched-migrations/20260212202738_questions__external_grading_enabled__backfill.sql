-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  questions;

-- BLOCK update_questions_external_grading_enabled
UPDATE questions
SET
  external_grading_enabled = false
WHERE
  external_grading_enabled IS NULL
  AND id >= $start
  AND id <= $end;
