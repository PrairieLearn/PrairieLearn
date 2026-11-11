-- BLOCK select_print_instance_question
SELECT
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(q.*) AS question
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  iq.id = $instance_question_id
  AND iq.assessment_instance_id = $assessment_instance_id
  AND aq.assessment_id = $assessment_id;

-- BLOCK select_print_variant
SELECT
  to_jsonb(v.*) AS variant
FROM
  variants AS v
WHERE
  v.id = $variant_id
  AND v.instance_question_id = $instance_question_id
  AND v.question_id = $question_id
  AND v.course_id = $course_id;
