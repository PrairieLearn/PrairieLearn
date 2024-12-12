-- BLOCK select_draft_generation_info_by_course_id
SELECT
  to_jsonb(dqm.*) AS draft_question_metadata,
  q.id AS question_id,
  q.qid,
  u.uid
FROM
  questions AS q
  LEFT JOIN draft_question_metadata AS dqm ON dqm.question_id = q.id
  LEFT JOIN users As u ON u.user_id = dqm.created_by
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL
  AND q.qid IS NOT NULL;

-- BLOCK select_drafts_by_course_id
SELECT
  *
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.deleted_at IS NULL
  AND q.draft IS TRUE;
