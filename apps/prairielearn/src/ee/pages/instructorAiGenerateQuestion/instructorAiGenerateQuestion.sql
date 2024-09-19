-- BLOCK select_added_question
SELECT
  *
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;
