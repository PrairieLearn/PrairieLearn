-- BLOCK select_courses
SELECT
  *
FROM
  pl_courses
WHERE
  institution_id = $institution_id
  AND deleted_at IS NULL;
