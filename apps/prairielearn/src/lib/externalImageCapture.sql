-- BLOCK insert_new_external_image_capture
INSERT INTO
  external_image_capture (
    user_id,
    created_at,
    variant_id,
    answer_name,
    file_id
  )
VALUES
  (
    $user_id,
    NOW(),
    $variant_id,
    $answer_name,
    $file_id
  )
ON CONFLICT ON CONSTRAINT external_image_capture_variant_id_and_answer_name_unique DO UPDATE
SET
  file_id = EXCLUDED.file_id;
