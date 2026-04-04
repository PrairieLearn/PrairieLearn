-- BLOCK select_assessment_questions
SELECT
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS question_course
FROM
  assessment_questions AS aq
  JOIN questions AS q ON aq.question_id = q.id
  JOIN courses AS c ON q.course_id = c.id
WHERE
  aq.assessment_id = $assessment_id
  AND aq.deleted_at IS NULL
ORDER BY
  aq.number;

-- BLOCK select_instance_questions_for_assessment_question
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(u.*) AS user
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON ai.id = iq.assessment_instance_id
  LEFT JOIN team_configs AS gc ON gc.assessment_id = ai.assessment_id
  LEFT JOIN LATERAL (
    SELECT DISTINCT
      ON (gu.team_id) gu.user_id
    FROM
      team_users AS gu
    WHERE
      gu.team_config_id = gc.id
      AND gu.team_id = ai.team_id
  ) AS rug ON TRUE
  JOIN users AS u ON u.id = COALESCE(ai.user_id, rug.user_id)
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND ai.open
  AND iq.open;

-- BLOCK select_existing_submission
SELECT
  s.id
FROM
  variants AS v
  JOIN submissions AS s ON s.variant_id = v.id
WHERE
  v.instance_question_id = $instance_question_id
LIMIT
  1;
