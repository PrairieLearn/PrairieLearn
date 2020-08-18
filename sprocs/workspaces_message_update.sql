CREATE OR REPLACE FUNCTION
    workspaces_message_update(
        workspace_id bigint,
        workspace_message text
    ) returns void
AS $$
BEGIN
    UPDATE
        workspaces as w
    SET
        message = workspace_message,
        message_updated_at = now()
    WHERE
        w.id = workspace_id;

    INSERT INTO workspace_logs
        (date, level, message, workspace_id)
    VALUES
        (now(), 'info'::enum_log_level, 'message:' || workspace_message, workspace_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
