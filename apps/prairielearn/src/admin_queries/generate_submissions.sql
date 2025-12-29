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
  TO_JSONB(iq.*) AS instance_question,
  TO_JSONB(q.*) AS question,
  TO_JSONB(u.*) AS user,
  TO_JSONB(c.*) AS question_course
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
  AND ai.open
  AND iq.open;
