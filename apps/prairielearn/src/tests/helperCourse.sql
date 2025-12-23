-- BLOCK update_course_repo
UPDATE pl_courses
SET
  repository = $repository
WHERE
  id = $courseId;
