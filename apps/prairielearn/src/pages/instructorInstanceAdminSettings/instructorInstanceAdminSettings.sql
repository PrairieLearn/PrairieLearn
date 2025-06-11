-- BLOCK short_names
SELECT
  ci.short_name
FROM
  course_instances AS ci
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL;
