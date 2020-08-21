DROP FUNCTION IF EXISTS workspaces_message_update(bigint, text);

CREATE OR REPLACE FUNCTION
    workspaces_message_update(
        workspace_id bigint,
        workspace_level enum_log_level,
        workspace_message text
    ) returns void
AS $$
DECLARE
    workspace_version bigint;
BEGIN
    UPDATE
        workspaces as w
    SET
        message = workspace_message,
        message_updated_at = now()
    WHERE
        w.id = workspace_id
    RETURNING
        w.version INTO workspace_version;

    INSERT INTO workspace_logs
        (date, level, message, workspace_id, version)
    VALUES
        (now(), workspace_level, workspace_message, workspace_id, workspace_version);
END;
$$ LANGUAGE plpgsql VOLATILE;
