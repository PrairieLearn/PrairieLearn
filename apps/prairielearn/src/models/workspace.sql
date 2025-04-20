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
