-- BLOCK select_latest_publishing_extension_by_enrollment_id
SELECT
  ci_extensions.*
FROM
  course_instance_publishing_extensions AS ci_extensions
  JOIN course_instance_publishing_enrollment_extensions AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
WHERE
  ci_enrollment_extensions.enrollment_id = $enrollment_id
ORDER BY
  ci_extensions.end_date DESC
LIMIT
  1;
