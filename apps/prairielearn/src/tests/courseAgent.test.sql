-- BLOCK course
SELECT
  id
FROM
  courses
WHERE
  deleted_at IS NULL
ORDER BY
  id
LIMIT
  1;
