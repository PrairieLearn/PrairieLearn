-- BLOCK set_review_course
UPDATE courses
SET
  repository = $repository,
  branch = $branch,
  path = $path
WHERE
  id = $course_id;
