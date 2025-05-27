-- BLOCK insert_new_external_image_capture
INSERT INTO 
  external_image_capture (
      user_id,
      created_at,
      variant_id,
      answer_name,
      file_id
  )
VALUES (
  $user_id,
  NOW(),
  $variant_id,
  $answer_name,
  $file_id
) 
ON CONFLICT ON CONSTRAINT external_image_capture_variant_element_uuid_unique
  DO UPDATE SET file_id = EXCLUDED.file_id;

-- BLOCK select_external_image_capture_by_variant_and_element
SELECT
  eic.*
FROM
  external_image_capture AS eic
WHERE
  eic.variant_id = $variant_id
  AND eic.answer_name = $answer_name
  AND eic.deleted_at IS NULL;

-- BLOCK select_variant_by_id
SELECT
  v.*,
  ai.assessment_id AS assessment_id,
  iq.assessment_instance_id AS assessment_instance_id
FROM
  variants AS v
  LEFT JOIN instance_questions AS iq ON v.instance_question_id = iq.id
  LEFT JOIN assessment_instances AS ai ON iq.assessment_instance_id = ai.id
WHERE
  v.id = $variant_id; 
