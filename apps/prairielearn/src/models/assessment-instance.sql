-- BLOCK select_assessment_instance_by_id
SELECT
  *
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id;
