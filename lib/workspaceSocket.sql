-- BLOCK update_workspace_state
UPDATE
    workspaces as w
SET
    state = $state::enum_workspace_state
WHERE
    w.id = $workspace_id;
