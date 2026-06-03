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

-- BLOCK select_manual_only_instance_question
SELECT
  iq.id,
  COALESCE(aq.max_manual_points, 0) AS max_manual_points,
  COALESCE(aq.max_auto_points, 0) AS max_auto_points
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND COALESCE(aq.max_manual_points, 0) > 0
  AND COALESCE(aq.max_auto_points, 0) = 0
ORDER BY
  aq.max_manual_points DESC,
  iq.id
LIMIT
  1;

-- BLOCK select_mixed_instance_question
SELECT
  iq.id,
  COALESCE(aq.max_manual_points, 0) AS max_manual_points,
  COALESCE(aq.max_auto_points, 0) AS max_auto_points
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND COALESCE(aq.max_manual_points, 0) > 0
  AND COALESCE(aq.max_auto_points, 0) > 0
ORDER BY
  aq.max_manual_points DESC,
  iq.id
LIMIT
  1;

-- BLOCK mark_single_instance_question_requires_manual_grading
UPDATE instance_questions
SET
  requires_manual_grading = TRUE
WHERE
  id = $instance_question_id;

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
  status = $status
WHERE
  id = $instance_question_id;

-- BLOCK set_assessment_instance_max_points
UPDATE assessment_instances
SET
  max_points = $max_points
WHERE
  id = $assessment_instance_id;
