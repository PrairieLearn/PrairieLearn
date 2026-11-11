-- BLOCK select_record_counts
SELECT
  (
    SELECT
      count(*)::integer
    FROM
      assessment_instances
  ) AS assessment_instances,
  (
    SELECT
      count(*)::integer
    FROM
      instance_questions
  ) AS instance_questions,
  (
    SELECT
      count(*)::integer
    FROM
      variants
  ) AS variants;

-- BLOCK select_form_variants
SELECT
  v.id,
  v.open
FROM
  print_form_questions AS pfq
  JOIN variants AS v ON v.id = pfq.variant_id
WHERE
  pfq.print_form_id = $print_form_id
ORDER BY
  pfq.position;

-- BLOCK close_variants
UPDATE variants AS v
SET
  open = FALSE
FROM
  print_form_questions AS pfq
WHERE
  v.id = pfq.variant_id
  AND pfq.print_form_id = $print_form_id;
