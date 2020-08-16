CREATE OR REPLACE FUNCTION
    workspaces_state_update(
        workspace_id bigint,
        workspace_state text,
        workspace_message text
    ) returns void
AS $$
BEGIN
    UPDATE
        workspaces as w
    SET
        state = workspace_state::enum_workspace_state,
        state_updated_at = now(),
        message = workspace_message,
        message_updated_at = now()
    WHERE
        w.id = workspace_id;

    INSERT INTO workspace_logs
        (date, level, message, workspace_id)
    VALUES
        (now(),
         'info'::enum_log_level,
         CASE
             WHEN (workspace_message = '') IS NOT FALSE -- either empty or null
             THEN 'state:' || workspace_state
             ELSE 'state:' || workspace_state || ', message:' || workspace_message
         END,
         workspace_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
