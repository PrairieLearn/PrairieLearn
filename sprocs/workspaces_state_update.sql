DROP FUNCTION IF EXISTS workspaces_state_update(bigint, text);
DROP FUNCTION IF EXISTS workspaces_state_update(bigint, enum_workspace_state, text);

CREATE OR REPLACE FUNCTION
    workspaces_state_update(
        workspace_id bigint,
        workspace_state enum_workspace_state,
        workspace_message text
    ) returns void
AS $$
DECLARE
    workspace_version bigint;
BEGIN
    UPDATE
        workspaces as w
    SET
        state = workspace_state,
        state_updated_at = now(),
        message = workspace_message,
        message_updated_at = now(),
        launched_at = CASE WHEN workspace_state = 'launching' THEN now() ELSE launched_at END,
        heartbeat_at = CASE WHEN workspace_state = 'running' THEN now() ELSE heartbeat_at END,
        running_at = CASE WHEN workspace_state = 'running' THEN now() ELSE running_at END,
        stopped_at = CASE WHEN workspace_state = 'stopped' THEN now() ELSE stopped_at END
    WHERE
        w.id = workspace_id
    RETURNING
        w.version INTO workspace_version;

    INSERT INTO workspace_logs
        (date, workspace_id, version, state, message)
    VALUES
        (now(), workspace_id, workspace_version, workspace_state, workspace_message);
END;
$$ LANGUAGE plpgsql VOLATILE;
