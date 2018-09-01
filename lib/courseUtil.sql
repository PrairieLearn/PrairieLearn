-- BLOCK update_course_commit_hash
UPDATE pl_courses
SET
    commit_hash = $commit_hash
WHERE
    id = $course_id;
