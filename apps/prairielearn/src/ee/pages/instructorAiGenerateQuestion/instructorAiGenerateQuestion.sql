-- BLOCK select_ai_question_generation_prompts
SELECT
  ai_question_generation_prompts.*
FROM
  ai_question_generation_prompts
  JOIN questions ON ai_question_generation_prompts.question_id = questions.id
WHERE
  questions.qid = $qid
  AND questions.course_id = $course_id
  AND questions.deleted_at IS NULL
ORDER BY
  ai_question_generation_prompts.id;
