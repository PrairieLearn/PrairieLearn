-- BLOCK update_course_repo
UPDATE pl_courses
SET
  repository = $repo
WHERE
  id = 1;
