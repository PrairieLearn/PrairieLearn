-- BLOCK select_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id;

-- BLOCK select_variant_id_for_workspace
SELECT
  id
FROM
  variants
WHERE
  workspace_id = $workspace_id;

-- BLOCK select_auth_data_from_workspace
SELECT
  v.id AS variant_id,
  v.question_id,
  v.instance_question_id,
  v.course_instance_id,
  v.course_id
FROM
  workspaces AS w
  JOIN variants AS v ON (w.id = v.workspace_id)
  JOIN questions AS q ON (v.question_id = q.id)
WHERE
  w.id = $workspace_id;
