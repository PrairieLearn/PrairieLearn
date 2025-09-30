-- BLOCK select_assessment_set_by_id
SELECT
  *
FROM
  assessment_sets
WHERE
  id = $assessment_set_id;
