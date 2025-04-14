-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
WHERE
  id = $assessment_id;
