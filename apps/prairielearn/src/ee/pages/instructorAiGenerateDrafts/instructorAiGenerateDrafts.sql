-- BLOCK select_drafts_by_course_id
SELECT
  dqm.*,
  q.qid,
  u.uid
FROM
  questions AS q
  LEFT JOIN draft_question_metadata AS dqm ON dqm.question_id = q.id
  LEFT JOIN users As u ON u.user_id = dqm.created_by
WHERE
  q.course_id = $course_id
  AND q.draft IS TRUE
  AND q.deleted_at IS NULL;
