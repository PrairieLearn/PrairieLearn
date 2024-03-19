-- BLOCK select_question_by_id
SELECT
  *
FROM
  questions
where
  id = $question_id;

-- BLOCK select_question_by_instance_question_id
SELECT
  q.*
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.id = $instance_question_id;
