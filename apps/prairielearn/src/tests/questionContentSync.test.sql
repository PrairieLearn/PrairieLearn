-- BLOCK set_commit_hash
UPDATE courses
SET
  commit_hash = $hash
WHERE
  id = $courseId;
