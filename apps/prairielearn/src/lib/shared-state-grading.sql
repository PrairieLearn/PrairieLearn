-- BLOCK select_assessment_instance_id_for_instance_question
SELECT
  iq.assessment_instance_id
FROM
  instance_questions AS iq
WHERE
  iq.id = $instance_question_id;
