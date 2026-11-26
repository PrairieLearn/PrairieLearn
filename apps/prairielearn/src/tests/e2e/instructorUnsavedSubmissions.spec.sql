-- BLOCK select_assessment_instance_id
SELECT
  assessment_instance_id
FROM
  instance_questions
WHERE
  id = $instance_question_id;
