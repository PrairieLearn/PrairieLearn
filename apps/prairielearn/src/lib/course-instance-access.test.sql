-- BLOCK insert_course_instance
INSERT INTO
  course_instances (
    id,
    uuid,
    course_id,
    display_timezone,
    enrollment_code,
    publishing_publish_date,
    publishing_archive_date
  )
VALUES
  (
    $id,
    $uuid,
    $course_id,
    $display_timezone,
    $enrollment_code,
    $publishing_publish_date,
    $publishing_archive_date
  );

-- BLOCK cleanup_extension_tests
DELETE FROM course_instance_publishing_enrollment_extensions
WHERE
  course_instance_publishing_extension_id IN (
    SELECT
      id
    FROM
      course_instance_publishing_extensions
    WHERE
      course_instance_id = 100
  );

DELETE FROM course_instance_publishing_extensions
WHERE
  course_instance_id = 100;

DELETE FROM enrollments
WHERE
  id = 100;

DELETE FROM users
WHERE
  user_id = 100;

DELETE FROM course_instances
WHERE
  id = 100;

DELETE FROM pl_courses
WHERE
  id = 100;
