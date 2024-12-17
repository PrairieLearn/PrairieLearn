-- BLOCK select_questions_by_ids_and_course_id
SELECT
  *
FROM
  questions as q
WHERE
  q.id::text = ANY ($question_ids)
  AND q.course_id = $course_id;
