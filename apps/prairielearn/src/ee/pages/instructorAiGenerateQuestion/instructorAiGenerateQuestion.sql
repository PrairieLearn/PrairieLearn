-- BLOCK select_added_question
SELECT
  *
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;

-- BLOCK select_all_drafts
SELECT
  *
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.draft IS TRUE;

-- BLOCK select_question_by_qid_and_course
SELECT
  *
FROM
  questions as q
WHERE
  q.qid = $qid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;

-- BLOCK select_generation_thread_items
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
