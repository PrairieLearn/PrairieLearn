-- BLOCK select_instance_question
SELECT
  iq.*
FROM
  instance_questions AS iq
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND iq.assessment_question_id = $assessment_question_id;
