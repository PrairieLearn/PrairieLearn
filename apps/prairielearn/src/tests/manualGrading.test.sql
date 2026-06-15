-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $iqId;

-- BLOCK get_assessment_instance_for_iq
SELECT
  ai.*
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
WHERE
  iq.id = $iqId;
