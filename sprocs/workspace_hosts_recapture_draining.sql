CREATE OR REPLACE FUNCTION
    workspace_hosts_recapture_draining(
        IN needed_hosts integer,
        OUT recaptured_hosts integer
    )
AS $$
BEGIN
    -- Find ids of at most `needed_hosts` hosts that are currently draining
    CREATE TEMPORARY TABLE found_draining_hosts ON COMMIT DROP AS (
        SELECT *
        FROM workspace_hosts AS wh
        WHERE wh.state = 'draining'
        ORDER BY launched_at DESC
        LIMIT needed_hosts
    );
    SELECT count(*) INTO recaptured_hosts FROM found_draining_hosts;

    -- Update the hosts to be ready
    UPDATE workspace_hosts AS wh
    SET state = 'ready',
        state_changed_at = NOW()
    FROM found_draining_hosts AS f
    WHERE wh.id = f.id;
END;
$$ LANGUAGE plpgsql VOLATILE;
