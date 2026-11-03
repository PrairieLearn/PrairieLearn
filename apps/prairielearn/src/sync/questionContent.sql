-- BLOCK select_question_for_file
SELECT
  *
FROM
  questions
WHERE
  course_id = $course_id
  AND deleted_at IS NULL
  AND qid = ANY ($qids::text[])
ORDER BY
  length(qid)
LIMIT
  1;
