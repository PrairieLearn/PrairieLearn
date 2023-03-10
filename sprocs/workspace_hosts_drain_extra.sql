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
    WITH updated_workspace_hosts AS (
      UPDATE workspace_hosts AS wh
      SET state = 'draining',
          state_changed_at = NOW()
      FROM extra AS e
      WHERE wh.id = e.id
      RETURNING wh.id, wh.state
    )
    INSERT INTO workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      'Draining extra host'
    FROM
      updated_workspace_hosts AS wh;
END;
$$ LANGUAGE plpgsql VOLATILE;
