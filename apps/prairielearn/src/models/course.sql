-- BLOCK select_course
SELECT
  *
FROM
  pl_courses
where
  id = $course_id;
