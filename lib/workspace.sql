-- BLOCK select_workspace_hosts
SELECT * FROM workspace_hosts;

-- BLOCK update_workspaces_workspace_host_id
UPDATE
    workspaces as w
SET
    workspace_host_id = $workspace_host_id
WHERE
    w.id = $workspace_id;

-- BLOCK select_workspace
SELECT *
FROM workspaces
WHERE id = $workspace_id;
