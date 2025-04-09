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
