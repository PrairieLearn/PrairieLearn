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
