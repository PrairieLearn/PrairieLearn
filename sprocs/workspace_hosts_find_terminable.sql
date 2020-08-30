CREATE OR REPLACE FUNCTION
    workspace_hosts_find_terminable(
        IN unhealthy_timeout_sec integer,
        IN launch_timeout_sec integer,
        OUT terminated_hosts text[]
    )
AS $$
BEGIN
    -- Find:
    --  draining/unhealthy hosts
    --  unhealthy hosts that have been unhealthy for a while
    --  hosts that have been stuck in launching for a while
    CREATE TEMPORARY TABLE terminable_hosts ON COMMIT DROP AS (
        SELECT
            wh.*
        FROM
            workspace_hosts AS wh
        WHERE
            (((wh.state = 'draining' OR wh.state = 'unhealthy') AND wh.load_count = 0) OR
            (wh.state = 'unhealthy' AND (now() - wh.unhealthy_at) > make_interval(secs => unhealthy_timeout_sec)) OR
            (wh.state = 'launching' AND (now() - wh.launched_at) > make_interval(secs => launch_timeout_sec)))
    );

    -- Update hosts to be 'terminating'
    UPDATE workspace_hosts AS wh
    SET state = 'terminating',
        state_changed_at = NOW()
    FROM terminable_hosts AS th
    WHERE wh.id = th.id;

    -- Save our terminated hosts
    SELECT array_agg(th.instance_id)
    INTO terminated_hosts
    FROM terminable_hosts AS th;
END;
$$ LANGUAGE plpgsql VOLATILE;
