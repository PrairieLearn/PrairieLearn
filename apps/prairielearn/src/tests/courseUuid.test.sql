-- BLOCK insert_course
INSERT INTO
  courses (path, display_timezone)
VALUES
  ($path, 'UTC')
RETURNING
  id;

-- BLOCK select_course
SELECT
  *
FROM
  courses
WHERE
  id = $course_id;

-- BLOCK update_course_uuid
UPDATE courses
SET
  uuid = $uuid::uuid
WHERE
  id = $course_id;
