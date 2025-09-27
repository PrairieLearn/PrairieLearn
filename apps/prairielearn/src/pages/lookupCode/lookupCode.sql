-- BLOCK select_course_instance_by_enrollment_code
SELECT
  ci.*
FROM
  course_instances AS ci
WHERE
  ci.enrollment_code = $enrollment_code
  AND ci.deleted_at IS NULL;
