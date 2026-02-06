-- BLOCK select_ai_question_generation_messages
SELECT
  *
FROM
  ai_question_generation_messages
WHERE
  question_id = $question_id
ORDER BY
  created_at ASC,
  id ASC;

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
