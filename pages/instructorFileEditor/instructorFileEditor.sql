-- BLOCK select_file_edit
SELECT
    fe.id,
    fe.commit_hash
FROM
    file_edits AS fe
WHERE
    fe.user_id = $user_id
    AND fe.course_id = $course_id
    AND fe.dir_name = $dir_name
    AND fe.file_name = $file_name

-- BLOCK insert_file_edit
WITH max_over_file_edits_with_same_course_and_user AS (
    SELECT
        coalesce(max(fe.id) + 1, 1) AS new_id
    FROM
        file_edits AS fe
    WHERE
        fe.user_id = $user_id
        AND fe.course_id = $course_id
)
INSERT INTO file_edits
    (id, user_id, course_id, dir_name, file_name, commit_hash)
SELECT
    new_id, $user_id, $course_id, $dir_name, $file_name, $commit_hash
FROM
    max_over_file_edits_with_same_course_and_user
RETURNING
    file_edits.id;

-- BLOCK delete_file_edit
DELETE FROM
    file_edits AS fe
WHERE
    fe.user_id = $user_id
    AND fe.course_id = $course_id
    AND fe.id = $id
    AND fe.file_name = $file_name;
