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
