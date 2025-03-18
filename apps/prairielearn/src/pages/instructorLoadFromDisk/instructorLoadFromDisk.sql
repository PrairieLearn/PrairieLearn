-- BLOCK select_all_courses
SELECT
  *
FROM
  pl_courses
WHERE
  deleted_at IS NULL
ORDER BY
  id ASC;
