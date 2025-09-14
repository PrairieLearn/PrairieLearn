-- BLOCK select_draft_generation_info_by_course_id
SELECT
  to_jsonb(dqm.*) AS draft_question_metadata,
  q.id AS question_id,
  q.qid,
  u.uid
FROM
  questions AS q
  LEFT JOIN draft_question_metadata AS dqm ON dqm.question_id = q.id
  LEFT JOIN users AS u ON u.user_id = dqm.created_by
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL
  AND q.qid IS NOT NULL
ORDER BY
  qid ASC;

-- BLOCK select_draft_questions_by_course_id
SELECT
  q.id
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL;

-- BLOCK select_ai_question_generation_prompts_by_course_id
SELECT
  p.*
FROM
  ai_question_generation_prompts AS p
  JOIN questions AS q ON (q.id = p.question_id)
WHERE
  q.course_id = $course_id
ORDER BY
  q.id ASC,
  p.id ASC;
