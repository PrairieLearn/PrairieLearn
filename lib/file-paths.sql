-- BLOCK select_question
SELECT
  q.*
FROM
  questions AS q
WHERE
  q.course_id = $course_id -- leave the same?
  AND q.directory = $directory
  AND q.deleted_at IS NULL;
