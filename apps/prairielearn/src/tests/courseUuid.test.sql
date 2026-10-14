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
