-- BLOCK select_latest_publishing_extension_by_enrollment_id
SELECT
  ci_extensions.*
FROM
  course_instance_publishing_extensions AS ci_extensions
  JOIN course_instance_publishing_extension_enrollments AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
WHERE
  ci_enrollment_extensions.enrollment_id = $enrollment_id
ORDER BY
  ci_extensions.end_date DESC
LIMIT
  1;

-- BLOCK select_publishing_extension_by_id
SELECT
  *
FROM
  course_instance_publishing_extensions
WHERE
  id = $id;

-- BLOCK select_publishing_extension_by_name
SELECT
  *
FROM
  course_instance_publishing_extensions
WHERE
  course_instance_id = $course_instance_id
  AND name = $name;

-- BLOCK insert_publishing_extension
INSERT INTO
  course_instance_publishing_extensions (course_instance_id, name, end_date)
VALUES
  ($course_instance_id, $name, $end_date)
RETURNING
  *;

-- BLOCK add_enrollment_to_publishing_extension
INSERT INTO
  course_instance_publishing_extension_enrollments (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  (
    $course_instance_publishing_extension_id,
    $enrollment_id
  )
RETURNING
  *;

-- BLOCK remove_enrollment_from_publishing_extension
DELETE FROM course_instance_publishing_extension_enrollments
WHERE
  course_instance_publishing_extension_id = $extension_id
  AND enrollment_id = $enrollment_id;

-- BLOCK delete_publishing_extension
DELETE FROM course_instance_publishing_extensions
WHERE
  id = $extension_id;

-- BLOCK update_publishing_extension
UPDATE course_instance_publishing_extensions
SET
  name = $name,
  end_date = $end_date
WHERE
  id = $extension_id
RETURNING
  *;

-- BLOCK select_enrollments_for_publishing_extension
SELECT
  e.*
FROM
  course_instance_publishing_extensions AS ci_extensions
  JOIN course_instance_publishing_extension_enrollments AS ci_enrollment_extensions ON (
    ci_enrollment_extensions.course_instance_publishing_extension_id = ci_extensions.id
  )
  JOIN enrollments AS e ON (e.id = ci_enrollment_extensions.enrollment_id)
WHERE
  ci_extensions.id = $extension_id
ORDER BY
  e.id;
