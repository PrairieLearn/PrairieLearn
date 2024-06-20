-- BLOCK select_question
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course
FROM
  questions AS q
  JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
  q.id = $question_id
  AND q.deleted_at IS NULL
  AND q.course_id = $course_id
  AND c.deleted_at IS NULL;
