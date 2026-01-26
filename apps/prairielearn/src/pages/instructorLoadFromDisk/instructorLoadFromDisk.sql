-- BLOCK select_all_courses
SELECT
  *
FROM
  courses
WHERE
  deleted_at IS NULL
ORDER BY
  id ASC;
