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
