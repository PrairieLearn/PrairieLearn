-- BLOCK select_eval_courses
SELECT
  id::text,
  short_name,
  path
FROM
  courses
WHERE
  short_name LIKE 'ai-grading-evals-%'
  AND deleted_at IS NULL
ORDER BY
  id;
