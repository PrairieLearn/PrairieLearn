-- BLOCK count_assessment_instances
SELECT
  count(*)::integer
FROM
  assessment_instances
WHERE
  assessment_id = $assessment_id;

-- BLOCK count_print_forms
SELECT
  count(*)::integer
FROM
  print_forms
WHERE
  assessment_id = $assessment_id;
