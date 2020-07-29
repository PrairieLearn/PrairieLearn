-- BLOCK select_workspace_state
SELECT
    state AS workspace_state
FROM
    workspaces as w
WHERE
    w.id = $workspace_id;
