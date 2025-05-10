-- BLOCK select_question_id_from_uuid
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id
  AND q.deleted_at IS NULL;

-- BLOCK insert_file_transfer
INSERT INTO
  file_transfers (
    user_id,
    from_course_id,
    from_filename,
    to_course_id,
    storage_filename,
    transfer_type
  )
SELECT
  $user_id,
  $from_course_id,
  $from_filename,
  $to_course_id,
  $storage_filename,
  $transfer_type
RETURNING
  file_transfers.id;
