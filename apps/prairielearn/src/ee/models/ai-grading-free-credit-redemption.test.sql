-- BLOCK insert_second_course_instance
INSERT INTO
  course_instances (
    course_id,
    short_name,
    long_name,
    display_timezone,
    enrollment_code
  )
VALUES
  (
    $course_id,
    'CI-2',
    'Second Course Instance',
    'America/Chicago',
    'TESTCI-002'
  )
RETURNING
  id;
