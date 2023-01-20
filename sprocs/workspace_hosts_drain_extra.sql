CREATE FUNCTION
    workspace_hosts_drain_extra(surplus integer) RETURNS void
AS $$
BEGIN
    -- Grab the oldest hosts first
    CREATE TEMPORARY TABLE extra ON COMMIT DROP AS (
        SELECT *
        FROM workspace_hosts AS wh
        WHERE wh.state = 'ready'
        ORDER BY wh.launched_at
        LIMIT surplus
    );

    -- Drain them (this sounds ominous :-))
    UPDATE workspace_hosts AS wh
    SET state = 'draining',
        state_changed_at = NOW()
    FROM extra AS e
    WHERE wh.id = e.id;
END;
$$ LANGUAGE plpgsql VOLATILE;
