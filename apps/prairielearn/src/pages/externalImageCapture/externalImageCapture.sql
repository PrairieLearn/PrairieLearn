-- BLOCK select_external_image_capture_by_variant_id_and_answer_name
SELECT
  eic.*
FROM
  external_image_capture AS eic
WHERE
  eic.variant_id = $variant_id
  AND eic.answer_name = $answer_name;

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
