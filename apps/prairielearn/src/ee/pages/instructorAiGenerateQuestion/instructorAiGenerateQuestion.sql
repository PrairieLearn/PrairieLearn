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
