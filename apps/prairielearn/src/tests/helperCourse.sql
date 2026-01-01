-- BLOCK update_course_repo
UPDATE courses
SET
  repository = $repository
WHERE
  id = $courseId;
