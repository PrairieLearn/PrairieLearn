-- BLOCK select_file
SELECT
  *
FROM
  files AS f
WHERE
  f.id = $file_id
  AND f.deleted_at IS NULL;

-- BLOCK delete_file
UPDATE files
SET
  deleted_by = $authn_user_id,
  deleted_at = current_timestamp
WHERE
  id = $file_id;

-- BLOCK insert_file
INSERT INTO
  files AS f (
    display_filename,
    storage_filename,
    type,
    assessment_id,
    assessment_instance_id,
    instance_question_id,
    user_id,
    created_by,
    storage_type
  )
VALUES
  (
    $display_filename,
    $storage_filename,
    $type,
    $assessment_id,
    $assessment_instance_id,
    $instance_question_id,
    $user_id,
    $authn_user_id,
    $storage_type
  )
RETURNING
  f.id;
