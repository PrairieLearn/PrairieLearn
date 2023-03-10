CREATE FUNCTION
    workspace_hosts_find_terminable(
        IN unhealthy_timeout_sec integer,
        IN launch_timeout_sec integer,
        OUT terminable_hosts text[]
    )
AS $$
BEGIN
    -- Find:
    --  draining/unhealthy hosts
    --  unhealthy hosts that have been unhealthy for a while
    --  hosts that have been stuck in launching for a while
    --  hosts in state 'terminating', to make sure they really terminate
    CREATE TEMPORARY TABLE tmp_terminable_hosts ON COMMIT DROP AS (
        SELECT
            wh.*
        FROM
            workspace_hosts AS wh
        WHERE
            (((wh.state = 'draining' OR wh.state = 'unhealthy') AND wh.load_count = 0) OR
            (wh.state = 'unhealthy' AND (now() - wh.unhealthy_at) > make_interval(secs => unhealthy_timeout_sec)) OR
            (wh.state = 'launching' AND (now() - wh.launched_at) > make_interval(secs => launch_timeout_sec))) OR
            (wh.state = 'terminating')
    );

    -- Update hosts to be 'terminating'
    -- Set state_changed_at if they weren't already 'terminating'
    WITH updated_workspace_hosts AS (
      UPDATE workspace_hosts AS wh
      SET state = 'terminating',
          state_changed_at = CASE WHEN wh.state = 'terminating' THEN wh.state_changed_at ELSE NOW() END
      FROM tmp_terminable_hosts AS th
      WHERE wh.id = th.id
      RETURNING wh.id, wh.state
    )
    INSERT INTO workspace_host_logs (workspace_host_id, state, message)
    SELECT
      wh.id,
      wh.state,
      -- TODO: use more precise message here?
      'Terminating host'
    FROM
      updated_workspace_hosts AS wh;

    -- Save our terminating hosts
    SELECT array_agg(th.instance_id)
    INTO terminable_hosts
    FROM tmp_terminable_hosts AS th;
END;
$$ LANGUAGE plpgsql VOLATILE;
