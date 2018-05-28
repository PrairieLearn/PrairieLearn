-- BLOCK update_course_commit_hash
UPDATE pl_courses as c
SET
    c.commit_hash = $commit_hash
WHERE
    c.id = $course_id;
