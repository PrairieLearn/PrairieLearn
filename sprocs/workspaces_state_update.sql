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
        state = workspace_state::enum_workspace_state,
        state_updated_at = now()
    WHERE
        w.id = workspace_id;

    INSERT INTO workspace_logs
        (date, level, message, workspace_id)
    VALUES
        (now(), 'info'::enum_log_level, workspace_state, workspace_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
