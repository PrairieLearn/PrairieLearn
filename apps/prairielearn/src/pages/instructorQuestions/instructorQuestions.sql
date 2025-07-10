-- BLOCK select_template_questions
WITH
  source_courses AS (
    SELECT
      *
    FROM
      pl_courses
    WHERE
      example_course IS TRUE
    UNION
    SELECT
      *
    FROM
      pl_courses
    WHERE
      id = $course_id
  )
SELECT
  c.example_course,
  q.qid,
  q.title
FROM
  questions AS q
  JOIN source_courses AS c ON (c.id = q.course_id)
WHERE
  q.qid LIKE 'template/%'
  AND q.title IS NOT NULL
  AND q.deleted_at IS NULL
ORDER BY
  c.example_course,
  q.title;
