-- BLOCK select_chunks
SELECT
  *
FROM
  chunks
WHERE
  course_id = $course_id
ORDER BY
  question_id;
