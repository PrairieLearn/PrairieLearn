-- BLOCK select_questions_for_printing
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question,
  qo.question_number,
  qo.question_access_mode
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
  JOIN question_order ($assessment_instance_id) AS qo ON (qo.instance_question_id = iq.id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  qo.row_order;
