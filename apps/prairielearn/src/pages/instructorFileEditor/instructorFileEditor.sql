-- BLOCK select_file_edit
SELECT
  fe.id,
  fe.orig_hash,
  fe.file_id,
  floor(
    DATE_PART('epoch', CURRENT_TIMESTAMP - fe.created_at) / 3600
  ) AS age,
  fe.job_sequence_id
FROM
  file_edits AS fe
WHERE
  fe.user_id = $user_id
  AND fe.course_id = $course_id
  AND fe.dir_name = $dir_name
  AND fe.file_name = $file_name
  AND fe.deleted_at IS NULL;

-- BLOCK insert_file_edit
INSERT INTO
  file_edits (
    user_id,
    course_id,
    dir_name,
    file_name,
    orig_hash,
    file_id
  )
SELECT
  $user_id,
  $course_id,
  $dir_name,
  $file_name,
  $orig_hash,
  $file_id
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
  AND fe.deleted_at IS NULL
RETURNING
  fe.file_id;

-- BLOCK update_job_sequence_id
UPDATE file_edits AS fe
SET
  job_sequence_id = $job_sequence_id
WHERE
  fe.id = $id;
