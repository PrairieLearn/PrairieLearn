-- BLOCK update_course_example_course
UPDATE courses
SET
  example_course = $example_course
WHERE
  id = $course_id;

-- BLOCK select_sharing_set
SELECT
  id
FROM
  sharing_sets
WHERE
  name = $sharing_set_name;
