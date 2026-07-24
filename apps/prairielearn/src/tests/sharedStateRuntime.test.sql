-- BLOCK select_instance_question_by_qid
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = $qid;

-- BLOCK select_variant_by_id
SELECT
  *
FROM
  variants
WHERE
  id = $variant_id;
