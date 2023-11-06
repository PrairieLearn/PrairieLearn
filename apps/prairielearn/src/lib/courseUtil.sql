-- BLOCK update_course_commit_hash
UPDATE pl_courses
SET
  commit_hash = $commit_hash
WHERE
  id = $course_id;

-- BLOCK get_course_data
SELECT
  path,
  repository,
  branch,
  commit_hash
FROM
  pl_courses
WHERE
  id = $course_id;
