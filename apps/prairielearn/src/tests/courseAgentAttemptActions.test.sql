-- BLOCK select_assessment_instance
SELECT
  ai.open,
  ai.date_limit,
  ai.score_perc,
  ai.points
FROM
  assessment_instances AS ai
WHERE
  ai.id = $assessment_instance_id;

-- BLOCK close_assessment_instance
UPDATE assessment_instances
SET
  open = FALSE
WHERE
  id = $assessment_instance_id;

-- BLOCK select_state_log_count
SELECT
  COUNT(*)::integer
FROM
  assessment_state_logs
WHERE
  assessment_instance_id = $assessment_instance_id
  AND auth_user_id = $auth_user_id;

-- BLOCK select_score_logs
SELECT
  asl.score_perc
FROM
  assessment_score_logs AS asl
WHERE
  asl.assessment_instance_id = $assessment_instance_id
  AND asl.auth_user_id = $auth_user_id
ORDER BY
  asl.id;

-- BLOCK select_instance_questions
SELECT
  iq.id,
  iq.points,
  iq.auto_points,
  iq.manual_points,
  iq.assigned_grader
FROM
  instance_questions AS iq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  iq.id;

-- BLOCK select_question_score_logs
SELECT
  qsl.points
FROM
  question_score_logs AS qsl
WHERE
  qsl.instance_question_id = $instance_question_id
  AND qsl.auth_user_id = $auth_user_id
ORDER BY
  qsl.id;
