-- BLOCK select_workspace_hostname
SELECT
  hostname
FROM
  workspaces
WHERE
  id = $workspace_id
  AND state = 'running';
