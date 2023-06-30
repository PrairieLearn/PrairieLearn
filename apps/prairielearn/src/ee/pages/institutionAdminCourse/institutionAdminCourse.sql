-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
WHERE
  id = $course_id
  AND institution_id = $institution_id
  AND deleted_at IS NULL;

-- BLOCK select_course_instances
SELECT
  ci.*
FROM
  course_instances AS ci
  JOIN pl_courses AS c ON (ci.course_id = c.id)
WHERE
  ci.course_id = $course_id
  AND ci.deleted_at IS NULL
  AND c.institution_id = $institution_id
  AND c.deleted_at IS NULL;
