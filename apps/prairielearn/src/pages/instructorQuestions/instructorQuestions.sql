-- BLOCK select_template_questions
SELECT
  q.qid,
  q.title
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.qid LIKE 'template/%'
  AND q.title IS NOT NULL
  AND q.deleted_at IS NULL
ORDER BY
  c.example_course,
  q.title;
