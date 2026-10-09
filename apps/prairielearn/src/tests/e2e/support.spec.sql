-- BLOCK set_example_course
UPDATE courses
SET
  example_course = $example
WHERE
  id = $course_id;
