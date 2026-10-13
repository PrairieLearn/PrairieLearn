-- BLOCK close_variants
UPDATE variants AS v
SET
  open = FALSE
FROM
  instance_questions AS iq
WHERE
  v.instance_question_id = iq.id
  AND iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK set_shuffle_questions
UPDATE assessments
SET
  shuffle_questions = $shuffle_questions
WHERE
  id = $assessment_id;
