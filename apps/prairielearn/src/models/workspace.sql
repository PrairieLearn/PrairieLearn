-- BLOCK select_variant_id_for_workspace
SELECT
  id
FROM
  variants
WHERE
  workspace_id = $workspace_id;
