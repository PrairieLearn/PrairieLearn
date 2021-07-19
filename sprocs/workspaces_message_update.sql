CREATE FUNCTION
    workspaces_message_update(
        workspace_id bigint,
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
        (date, workspace_id, version, message)
    VALUES
        (now(), workspace_id, workspace_version, workspace_message);
END;
$$ LANGUAGE plpgsql VOLATILE;
