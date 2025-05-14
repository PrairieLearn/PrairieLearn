-- BLOCK get_institution_id
SELECT
  institution_id
FROM
  pl_courses
WHERE
  id = $course_id;
