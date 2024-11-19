-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
where
  id = $assessment_id;