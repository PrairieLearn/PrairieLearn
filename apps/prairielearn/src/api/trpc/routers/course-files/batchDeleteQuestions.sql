-- BLOCK select_questions_by_ids_and_course_id
SELECT
  *
FROM
  questions AS q
WHERE
  q.id = ANY ($question_ids::bigint[])
  AND q.course_id = $course_id;
