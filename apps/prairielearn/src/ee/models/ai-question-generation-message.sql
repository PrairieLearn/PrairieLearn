-- BLOCK select_ai_question_generation_messages
SELECT
  m.*,
  u.name AS user_name
FROM
  ai_question_generation_messages AS m
  LEFT JOIN users AS u ON u.id = m.authn_user_id
WHERE
  m.question_id = $question_id
ORDER BY
  m.created_at ASC,
  m.id ASC;

-- BLOCK select_ai_question_generation_context_messages
SELECT
  *
FROM
  ai_question_generation_messages
WHERE
  question_id = $question_id
  AND include_in_context = TRUE
ORDER BY
  created_at ASC,
  id ASC;
