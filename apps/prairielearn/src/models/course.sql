-- BLOCK select_course_by_id
SELECT
  *
FROM
  pl_courses
where
  id = $course_id;

-- BLOCK update_course_commit_hash
UPDATE pl_courses
SET
  commit_hash = $commit_hash
WHERE
  id = $course_id;
