-- BLOCK update_course_example_course
UPDATE courses
SET
  example_course = $example_course
WHERE
  id = $course_id;
