CREATE OR REPLACE FUNCTION
    workspaces_state_update(
        workspace_id bigint,
        workspace_state text
    ) returns void
AS $$
BEGIN
    UPDATE
        workspaces as w
    SET
        state = workspace_state::enum_workspace_state
    WHERE
        w.id = workspace_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
