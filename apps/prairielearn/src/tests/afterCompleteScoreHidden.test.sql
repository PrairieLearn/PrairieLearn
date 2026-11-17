-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;

-- BLOCK mark_requires_manual_grading
UPDATE instance_questions
SET
  requires_manual_grading = TRUE
WHERE
  assessment_instance_id = $assessment_instance_id;
