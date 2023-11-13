-- BLOCK select_course_by_id
SELECT
  *
FROM
  pl_courses
where
  id = $course_id;
