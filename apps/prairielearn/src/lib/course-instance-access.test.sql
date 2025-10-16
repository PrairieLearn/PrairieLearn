-- BLOCK setup_extension_tests
WITH
  setup_course AS (
    INSERT INTO
      pl_courses (id, display_timezone, path)
    VALUES
      (100, 'UTC', '/path/to/course/100')
  ),
  setup_course_instance AS (
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
        100,
        '5159a291-566f-4463-8f11-b07c931ad72a',
        100,
        'UTC',
        'TEST123',
        '2024-01-01 00:00:00-00',
        $course_instance_archive_date
      )
  ),
  setup_user AS (
    INSERT INTO
      users (user_id, uid, institution_id)
    VALUES
      (100, 'testuser@example.com', 1)
  ),
  setup_enrollment AS (
    INSERT INTO
      enrollments (id, user_id, course_instance_id, first_joined_at)
    VALUES
      (100, 100, 100, '2024-01-01 00:00:00-00')
  )
SELECT
  TRUE;

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

-- BLOCK insert_extension
INSERT INTO
  course_instance_publishing_extensions (
    course_instance_id,
    name,
    archive_date
  )
VALUES
  ($course_instance_id, $name, $archive_date)
RETURNING
  *;

-- BLOCK link_extension_to_enrollment
INSERT INTO
  course_instance_publishing_enrollment_extensions (
    course_instance_publishing_extension_id,
    enrollment_id
  )
VALUES
  ($extension_id, $enrollment_id)
RETURNING
  *;
