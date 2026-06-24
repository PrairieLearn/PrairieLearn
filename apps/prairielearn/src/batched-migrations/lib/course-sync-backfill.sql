-- BLOCK select_max_course_id
SELECT
  MAX(id) AS max
FROM
  pl_courses;

-- BLOCK select_courses_for_sync
SELECT
  *
FROM
  pl_courses
WHERE
  id >= $min
  AND id <= $max
  AND deleted_at IS NULL;
