-- BLOCK select_workspace_logs
SELECT *
FROM workspace_logs
WHERE workspace_id = $workspace_id;
