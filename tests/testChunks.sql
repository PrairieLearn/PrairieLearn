-- BLOCK select_course_by_path
SELECT *
FROM pl_courses
WHERE path = $course_path;
