-- BLOCK select_print_variant
SELECT
  v.*
FROM
  print_form_questions AS pfq
  JOIN variants AS v ON v.id = pfq.variant_id
WHERE
  pfq.id = $print_form_question_id
  AND pfq.print_form_id = $print_form_id
  AND v.id = $variant_id
  AND v.instance_question_id IS NULL
  AND v.question_id = $question_id
  AND v.course_id = $course_id;

-- BLOCK select_ai_grading_instance_question
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

-- BLOCK select_ai_grading_variant
SELECT
  v.*
FROM
  variants AS v
WHERE
  v.id = $variant_id
  AND v.instance_question_id = $instance_question_id
  AND v.question_id = $question_id
  AND v.course_id = $course_id;
