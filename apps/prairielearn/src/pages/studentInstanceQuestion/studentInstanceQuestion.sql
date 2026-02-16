-- BLOCK select_last_variant_id
SELECT
  v.id
FROM
  variants AS v
WHERE
  v.instance_question_id = $instance_question_id
  AND v.broken_at IS NULL
ORDER BY
  v.date DESC
LIMIT
  1;

-- BLOCK select_assessment_tools
SELECT
  tool,
  enabled,
  settings
FROM
  assessment_tools
WHERE
  assessment_id = $assessment_id
  AND enabled = TRUE;
