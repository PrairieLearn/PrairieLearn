-- BLOCK update_example_course
UPDATE courses
SET
  example_course = $example_course
WHERE
  id = 1;
