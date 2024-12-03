-- BLOCK select_question_by_qid_and_course
SELECT
  *
FROM
  questions as q
WHERE
  q.qid = $qid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;

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
