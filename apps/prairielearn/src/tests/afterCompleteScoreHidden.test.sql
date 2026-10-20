-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;

-- BLOCK mark_grading_pending
UPDATE assessment_instances
SET
  grading_pending = TRUE
WHERE
  id = $assessment_instance_id;
