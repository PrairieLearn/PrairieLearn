CREATE FUNCTION
    workspace_hosts_recapture_draining(
        IN needed_hosts integer,
        OUT recaptured_hosts integer
    )
AS $$
BEGIN
    WITH
    -- Find ids of at most `needed_hosts` hosts that are currently draining
    found_draining_hosts AS (
        SELECT *
        FROM workspace_hosts AS wh
        WHERE wh.state = 'draining'
        ORDER BY launched_at DESC
        LIMIT needed_hosts
    ),
    -- Update found hosts to be ready if still draining
    updated_draining_hosts AS (
        UPDATE workspace_hosts AS wh
        SET
            state = 'ready',
            state_changed_at = NOW()
        FROM found_draining_hosts AS fdh
        WHERE
            wh.id = fdh.id
            AND wh.state = 'draining'
        RETURNING wh.*
    ),
    logs AS (
        INSERT INTO workspace_host_logs (workspace_host_id, state, message)
        SELECT
            wh.id,
            wh.state,
            'Recaptured host'
        FROM updated_draining_hosts AS wh
    )
    SELECT count(*) INTO recaptured_hosts FROM updated_draining_hosts;
END;
$$ LANGUAGE plpgsql VOLATILE;
