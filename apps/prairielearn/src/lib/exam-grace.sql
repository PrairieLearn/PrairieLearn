-- BLOCK lock_assessment_instance
SELECT
  *
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id
FOR NO KEY UPDATE;

-- BLOCK select_variant
SELECT
  to_jsonb(v.*) AS variant,
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(q.*) AS question,
  qo.question_access_mode
FROM
  variants v
  JOIN instance_questions iq ON iq.id = v.instance_question_id
  JOIN assessment_questions aq ON aq.id = iq.assessment_question_id
  JOIN questions q ON q.id = aq.question_id
  JOIN question_order (iq.assessment_instance_id) qo ON qo.instance_question_id = iq.id
WHERE
  v.id = $variant_id
  AND iq.assessment_instance_id = $assessment_instance_id
  AND q.deleted_at IS NULL;
