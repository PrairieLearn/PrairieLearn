-- BLOCK reset_variants_for_assessment_question
UPDATE variants AS v
SET
  broken_at = CURRENT_TIMESTAMP,
  broken_by = $authn_user_id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (iq.assessment_question_id = aq.id)
WHERE
  v.instance_question_id = iq.id
  AND v.open = true
  AND v.broken_at IS NULL
  AND aq.id = $unsafe_assessment_question_id
  AND aq.assessment_id = $assessment_id;
