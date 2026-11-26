-- BLOCK select_assessment_instances
SELECT
  *
FROM
  assessment_instances;

-- BLOCK mark_grading_pending
UPDATE instance_questions
SET
  status = 'saved',
  requires_manual_grading = TRUE
WHERE
  assessment_instance_id = $assessment_instance_id;
