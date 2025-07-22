-- BLOCK select_instance_questions
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
  JOIN pl_courses AS c ON q.course_id = c.id
  JOIN users AS u ON u.user_id = COALESCE(
    ai.user_id,
    (
      SELECT
        user_id
      FROM
        group_users AS gu
      WHERE
        gu.group_id = ai.group_id
      LIMIT
        1
    )
  )
WHERE
  ai.assessment_id = $assessment_id
  AND ai.open
  AND iq.open;
