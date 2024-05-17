-- BLOCK select_question_id_from_uuid
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;
