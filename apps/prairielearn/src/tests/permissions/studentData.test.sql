-- BLOCK select_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  AND (q.qid = $qid)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  AND (ai.assessment_id = $assessment_id);

-- BLOCK select_variant
SELECT
  v.*
FROM
  variants AS v
  JOIN instance_questions AS iq ON iq.id = v.instance_question_id
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  AND ai.assessment_id = $assessment_id;
