-- BLOCK select_instance_questions
WITH
  random_user_per_team AS (
    SELECT DISTINCT
      ON (tu.team_id) tu.team_id,
      tu.user_id
    FROM
      team_configs AS tc
      JOIN team_users AS tu ON tc.id = tu.team_config_id
    WHERE
      tc.assessment_id = $assessment_id
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
  LEFT JOIN random_user_per_team AS rut ON rut.team_id = ai.team_id
  JOIN users AS u ON u.id = COALESCE(ai.user_id, rut.user_id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.open
  AND iq.open;
