-- BLOCK insert_new_external_image_capture
INSERT INTO
  external_image_capture (
    created_at,
    updated_at,
    variant_id,
    answer_name,
    file_id
  )
VALUES
  (NOW(), NOW(), $variant_id, $answer_name, $file_id)
ON CONFLICT ON CONSTRAINT external_image_capture_variant_id_and_answer_name_unique DO UPDATE
SET
  updated_at = NOW(),
  file_id = EXCLUDED.file_id;
