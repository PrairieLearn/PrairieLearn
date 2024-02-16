-- BLOCK select_assessment_for_submission
SELECT
  ai.id AS assessment_instance_id
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  s.id = $submission_id;

-- BLOCK select_workspace_id
SELECT
  w.id AS workspace_id
FROM
  variants AS v
  JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE
  v.id = $variant_id;

-- BLOCK select_variant_data
SELECT
  v.instance_question_id,
  q.grading_method,
  aq.max_auto_points,
  aq.max_manual_points
FROM
  variants AS v
  JOIN questions AS q ON (q.id = v.question_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
WHERE
  v.id = $variant_id;

-- BLOCK select_last_submission_of_variant
SELECT
  s.*
FROM
  submissions AS s
WHERE
  s.variant_id = $variant_id
ORDER BY
  s.date DESC,
  s.id DESC
LIMIT
  1;
