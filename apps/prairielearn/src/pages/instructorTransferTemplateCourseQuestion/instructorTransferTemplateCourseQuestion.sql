-- BLOCK select_question
SELECT
  q.*
FROM
  questions AS q
  JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
  q.id = $question_id
  AND q.course_id = $course_id
  AND c.template_course IS TRUE;
