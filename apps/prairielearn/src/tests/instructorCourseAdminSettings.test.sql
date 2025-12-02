--BLOCK update_course_repo
UPDATE courses
SET
  repository = $repo
WHERE
  id = 1;
