-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessments;

-- BLOCK update_assessments
UPDATE assessments
SET
  json_allow_real_time_grading = FALSE
WHERE
  allow_real_time_grading = FALSE;
