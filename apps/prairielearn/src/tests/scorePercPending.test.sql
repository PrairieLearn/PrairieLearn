-- BLOCK select_latest_assessment_instance
SELECT
  *
FROM
  assessment_instances
WHERE
  assessment_id = $assessment_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK mark_instance_questions_requires_manual_grading
UPDATE instance_questions
SET
  requires_manual_grading = TRUE
WHERE
  assessment_instance_id = $assessment_instance_id;

-- BLOCK set_manual_requires_manual_grading_by_max_manual_points
UPDATE instance_questions AS iq
SET
  requires_manual_grading = (aq.max_manual_points = $pending_max_manual_points)
FROM
  assessment_questions AS aq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND iq.assessment_question_id = aq.id
  AND aq.max_manual_points > 0;
