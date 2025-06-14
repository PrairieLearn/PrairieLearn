-- BLOCK select_assessment_set_by_id
SELECT
  *
FROM
  assessment_sets
where
  id = $assessment_set_id;
