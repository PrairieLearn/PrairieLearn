-- BLOCK update_course_repository
UPDATE courses
SET
  repository = $repository
WHERE
  id = $course_id;
