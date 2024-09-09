-- BLOCK select_instance_questions_manual_grading
SELECT
  iq.*
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.requires_manual_grading
  AND iq.status != 'unanswered';

-- BLOCK select_last_variant_and_submission
SELECT
  to_jsonb(v.*) AS variant,
  to_jsonb(s.*) AS submission
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;
