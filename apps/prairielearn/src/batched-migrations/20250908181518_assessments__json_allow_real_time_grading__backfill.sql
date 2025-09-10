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
  id >= $start
  AND id <= $end
  AND json_allow_real_time_grading IS NULL
  -- The `json_` columns are meant to represent the exact state of whatever is
  -- in the JSON files. In this case, we can make some assumptions to avoid having
  -- to actually re-sync every course. Since real-time grading is enabled by
  -- default for all assessments, we'll assume that it's only worth preserving
  -- a value in the `json_` column if it's disallowed (false).
  AND allow_real_time_grading = FALSE;
