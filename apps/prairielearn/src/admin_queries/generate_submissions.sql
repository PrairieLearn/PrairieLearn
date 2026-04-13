-- BLOCK select_instance_questions
WITH
  random_user_per_group AS (
    SELECT DISTINCT
      ON (gu.team_id) gu.team_id,
      gu.user_id
    FROM
      team_configs AS gc
      JOIN team_users AS gu ON gc.id = gu.team_config_id
    WHERE
      gc.assessment_id = $assessment_id
  )
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(q.*) AS question,
  to_jsonb(u.*) AS user,
  to_jsonb(c.*) AS question_course,
  to_jsonb(aq.*) AS assessment_question
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON ai.id = iq.assessment_instance_id
  JOIN assessment_questions AS aq ON iq.assessment_question_id = aq.id
  JOIN questions AS q ON aq.question_id = q.id
  JOIN courses AS c ON q.course_id = c.id
  LEFT JOIN random_user_per_group AS rug ON rug.team_id = ai.team_id
  JOIN users AS u ON u.id = COALESCE(ai.user_id, rug.user_id)
WHERE
  ai.assessment_id = $assessment_id
  -- Only process open assessment instances and open instance questions.
  -- Re-running this query after a previous run will skip already-closed items.
  AND ai.open
  AND iq.open;

-- BLOCK select_instance_question_by_id
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.id = $instance_question_id;

-- BLOCK set_assessment_instance_grading_needed
UPDATE assessment_instances AS ai
SET
  grading_needed = $grading_needed
WHERE
  ai.id = $assessment_instance_id;
