-- BLOCK select_file_edit
SELECT
    fe.id,
    fe.commit_hash,
    fe.local_tmp_dir
FROM
    file_edits AS fe
WHERE
    fe.user_id = $user_id
    AND fe.course_id = $course_id
    AND fe.dir_name = $dir_name
    AND fe.file_name = $file_name
    AND fe.deleted_at IS NULL;

-- BLOCK insert_file_edit
WITH max_over_file_edits AS (
    SELECT
        coalesce(max(fe.id) + 1, 1) AS new_id
    FROM
        file_edits AS fe
    WHERE
        fe.user_id = $user_id
        AND fe.course_id = $course_id
        AND fe.dir_name = $dir_name
        AND fe.file_name = $file_name
        AND fe.deleted_at IS NULL
)
INSERT INTO file_edits
    (id, user_id, course_id, dir_name, file_name, commit_hash, local_tmp_dir)
SELECT
    new_id, $user_id, $course_id, $dir_name, $file_name, $commit_hash, $local_tmp_dir
FROM
    max_over_file_edits
RETURNING
    file_edits.id;

-- BLOCK soft_delete_file_edit
UPDATE file_edits AS fe
SET
    deleted_at = CURRENT_TIMESTAMP
WHERE
    fe.user_id = $user_id
    AND fe.course_id = $course_id
    AND fe.dir_name = $dir_name
    AND fe.file_name = $file_name
    AND fe.deleted_at IS NULL;
