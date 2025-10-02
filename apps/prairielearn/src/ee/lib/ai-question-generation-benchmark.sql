-- BLOCK select_ai_question_generation_prompts
SELECT
  *
FROM
  ai_question_generation_prompts
WHERE
  question_id = $question_id
ORDER BY
  id ASC;
