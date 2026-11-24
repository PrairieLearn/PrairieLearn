-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND aq.deleted_at IS NULL
  AND q.deleted_at IS NULL
  AND q.qid = 'addNumbers';
