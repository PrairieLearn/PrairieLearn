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
