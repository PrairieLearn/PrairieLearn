CREATE FUNCTION
    workspaces_state_update(
        workspace_id bigint,
        workspace_state enum_workspace_state,
        workspace_message text
    ) returns void
AS $$
DECLARE
    old_workspace workspaces;
    launching_delta interval = '0 seconds';
    running_delta interval = '0 seconds';
BEGIN
    -- Compute the duration deltas to add

    SELECT * INTO old_workspace FROM workspaces WHERE id = workspace_id;

    IF old_workspace.state = 'launching' THEN
        launching_delta = now() - old_workspace.state_updated_at;
    END IF;

    IF old_workspace.state = 'running' THEN
        running_delta = now() - old_workspace.state_updated_at;
    END IF;

    -- Update the workspace itself

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
        stopped_at = CASE WHEN workspace_state = 'stopped' THEN now() ELSE stopped_at END,
        launching_duration = launching_duration + launching_delta,
        running_duration = running_duration + running_delta
    WHERE
        w.id = workspace_id;

    -- Log it

    INSERT INTO workspace_logs
        (date, workspace_id, version, state, message)
    VALUES
        (now(), workspace_id, old_workspace.version, workspace_state, workspace_message);
END;
$$ LANGUAGE plpgsql VOLATILE;
