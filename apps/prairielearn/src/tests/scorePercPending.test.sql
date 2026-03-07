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

-- BLOCK clear_instance_questions_requires_manual_grading
UPDATE instance_questions
SET
  requires_manual_grading = FALSE
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

-- BLOCK count_pending_instance_questions
SELECT
  count(*)::int AS count
FROM
  instance_questions AS iq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND iq.requires_manual_grading;

-- BLOCK select_autograded_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND COALESCE(aq.max_auto_points, 0) > 0
  AND COALESCE(aq.max_manual_points, 0) = 0
ORDER BY
  iq.id
LIMIT
  1;

-- BLOCK update_instance_question_status
UPDATE instance_questions
SET
  status = $status::enum_instance_question_status
WHERE
  id = $instance_question_id;

-- BLOCK clear_manual_requires_manual_grading_for_assessment_instance
UPDATE instance_questions AS iq
SET
  requires_manual_grading = FALSE
FROM
  assessment_questions AS aq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND iq.assessment_question_id = aq.id
  AND COALESCE(aq.max_manual_points, 0) > 0;

-- BLOCK select_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  iq.id
LIMIT
  1;

-- BLOCK set_manual_points_for_assessment_instance
UPDATE instance_questions AS iq
SET
  manual_points = $manual_points
WHERE
  iq.assessment_instance_id = $assessment_instance_id;
