-- BLOCK insert_course_instance
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
    $short_name,
    $long_name,
    $display_timezone,
    $enrollment_code
  )
RETURNING
  id;
