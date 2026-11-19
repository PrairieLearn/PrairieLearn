-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id;
