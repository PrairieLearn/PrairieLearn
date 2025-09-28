-- BLOCK select_access_control_extensions_by_enrollment_id
SELECT
  ci_extensions.*
FROM
  course_instance_access_control_extensions AS ci_extensions
  JOIN course_instance_access_control_enrollment_extensions AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_access_control_extension_id = ci_extensions.id
  )
WHERE
  ci_enrollment_extensions.enrollment_id = $enrollment_id;

-- BLOCK insert_access_control_extension
INSERT INTO
  course_instance_access_control_extensions (
    course_instance_id,
    enabled,
    name,
    archive_date
  )
VALUES
  (
    $course_instance_id,
    $enabled,
    $name,
    $archive_date
  )
RETURNING
  *;

-- BLOCK insert_access_control_enrollment_extension
INSERT INTO
  course_instance_access_control_enrollment_extensions (
    course_instance_access_control_extension_id,
    enrollment_id
  )
VALUES
  (
    $course_instance_access_control_extension_id,
    $enrollment_id
  )
RETURNING
  *;

-- BLOCK select_access_control_extensions_by_course_instance
SELECT
  ci_extensions.*
FROM
  course_instance_access_control_extensions AS ci_extensions
WHERE
  ci_extensions.course_instance_id = $course_instance_id
ORDER BY
  ci_extensions.id;

-- BLOCK delete_access_control_extension
DELETE FROM course_instance_access_control_extensions
WHERE
  id = $extension_id
  AND course_instance_id = $course_instance_id;

-- BLOCK update_access_control_extension
UPDATE course_instance_access_control_extensions
SET
  enabled = $enabled,
  name = $name,
  published_end_date = $published_end_date
WHERE
  id = $extension_id
  AND course_instance_id = $course_instance_id
RETURNING
  *;
