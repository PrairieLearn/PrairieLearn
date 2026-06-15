CREATE FUNCTION
    workspace_loads_current(
        IN workspace_capacity_factor double precision,
        IN workspace_host_capacity double precision,
        -- desired values for autoscaling
        OUT workspace_jobs_capacity_desired integer,
        OUT workspace_hosts_desired integer,
        -- workspace hosts in each state
        OUT workspace_hosts_launching_count integer,
        OUT workspace_hosts_ready_count integer,
        OUT workspace_hosts_draining_count integer,
        OUT workspace_hosts_unhealthy_count integer,
        OUT workspace_hosts_terminating_count integer,
        OUT workspace_hosts_active_count integer,
        -- max time in each host state
        OUT workspace_hosts_longest_launching_sec double precision,
        OUT workspace_hosts_longest_ready_sec double precision,
        OUT workspace_hosts_longest_draining_sec double precision,
        OUT workspace_hosts_longest_unhealthy_sec double precision,
        OUT workspace_hosts_longest_terminating_sec double precision,
        -- workspaces in each state
        OUT workspace_uninitialized_count integer,
        OUT workspace_launching_count integer,
        OUT workspace_relaunching_count integer,
        OUT workspace_running_count integer,
        OUT workspace_running_on_healthy_hosts_count integer,
        OUT workspace_active_count integer,
        OUT workspace_active_on_healthy_hosts_count integer,
        -- max time in each workspace state
        OUT workspace_longest_launching_sec double precision,
        OUT workspace_longest_running_sec double precision,
        --
        OUT timestamp_formatted text
    )
AS $$
BEGIN
    -- Current number of running workspaces. We do this with separate queries
    -- because it maximizes the likelihood that Postgres will use the index
    -- instead of a sequential scan.
    SELECT count(*) INTO workspace_uninitialized_count FROM workspaces AS w WHERE w.state = 'uninitialized';
    SELECT count(*) INTO workspace_launching_count FROM workspaces AS w WHERE w.state = 'launching';
    SELECT count(*) INTO workspace_relaunching_count FROM workspaces AS w WHERE w.state = 'launching' AND num_nonnulls(w.rebooted_at, w.reset_at) > 0;
    SELECT count(*) INTO workspace_running_count FROM workspaces AS w WHERE w.state = 'running';
    SELECT count(*) INTO workspace_running_on_healthy_hosts_count
    FROM
        workspaces AS w
        JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
    WHERE
        w.state = 'running'
        AND (wh.state = 'ready' OR wh.state = 'draining');

    workspace_active_count := workspace_running_count + workspace_launching_count;
    workspace_active_on_healthy_hosts_count := workspace_running_on_healthy_hosts_count + workspace_launching_count;

    -- Longest running workspace in launching state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_updated_at)), 0)
    INTO workspace_longest_launching_sec
    FROM workspaces AS w
    WHERE w.state = 'launching';

    -- Longest running workspace in running state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_updated_at)), 0)
    INTO workspace_longest_running_sec
    FROM workspaces AS w
    WHERE w.state = 'running';

    -- Current number of workspace hosts
    SELECT COUNT(*) INTO workspace_hosts_launching_count FROM workspace_hosts AS h WHERE h.state = 'launching';
    SELECT COUNT(*) INTO workspace_hosts_ready_count FROM workspace_hosts AS h WHERE h.state = 'ready';
    SELECT COUNT(*) INTO workspace_hosts_draining_count FROM workspace_hosts AS h WHERE h.state = 'draining';
    SELECT COUNT(*) INTO workspace_hosts_unhealthy_count FROM workspace_hosts AS h WHERE h.state = 'unhealthy';
    SELECT COUNT(*) INTO workspace_hosts_terminating_count FROM workspace_hosts AS h WHERE h.state = 'terminating';

    workspace_hosts_active_count :=
        + workspace_hosts_launching_count
        + workspace_hosts_ready_count
        + workspace_hosts_draining_count
        + workspace_hosts_unhealthy_count
        + workspace_hosts_terminating_count;

    -- Longest running workspace host in launching state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_changed_at)), 0)
    INTO workspace_hosts_longest_launching_sec
    FROM workspace_hosts AS wh
    WHERE wh.state = 'launching';

    -- Longest running workspace host in ready state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_changed_at)), 0)
    INTO workspace_hosts_longest_ready_sec
    FROM workspace_hosts AS wh
    WHERE wh.state = 'ready';

    -- Longest running workspace host in draining state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_changed_at)), 0)
    INTO workspace_hosts_longest_draining_sec
    FROM workspace_hosts AS wh
    WHERE wh.state = 'draining';

    -- Longest running workspace host in unhealthy state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_changed_at)), 0)
    INTO workspace_hosts_longest_unhealthy_sec
    FROM workspace_hosts AS wh
    WHERE wh.state = 'unhealthy';

    -- Longest running workspace host in terminating state.
    SELECT COALESCE(max(DATE_PART('epoch', now() - state_changed_at)), 0)
    INTO workspace_hosts_longest_terminating_sec
    FROM workspace_hosts AS wh
    WHERE wh.state = 'terminating';

    -- Compute desired number of workspace hosts.
    --
    -- We consider both the number of active workspaces on healthy hosts, and
    -- the overall number of active workspaces. The former is used directly to
    -- ensure we have enough capacity to run all active workspaces. The latter
    -- is used to help ensure that we have enough capacity to quickly launch
    -- new workspaces, and is multiplied by a scaling factor.
    --
    -- The former value deliberately excludes workspaces running on unhealthy
    -- hosts. This is because we don't want to overprovision capacity after a
    -- deploy when we mark all existing hosts as unhealthy.
    --
    -- A worked example with the following values:
    --
    --   100 workspaces running on healthy/draining hosts
    --   50 workspaces launching
    --   100 workspaces running on unhealthy hosts
    --   workspace_capacity_factor = 1.5
    --
    -- This means that we have the following values for the below computation:
    --
    --   workspace_active_on_healthy_hosts_count = 150
    --   workspace_active_count = 250
    --
    -- We find that we want to have capacity for 150 + (250 * 0.5) = 275 workspaces.
    workspace_jobs_capacity_desired := workspace_active_on_healthy_hosts_count + workspace_active_count * (workspace_capacity_factor - 1);
    workspace_hosts_desired := CEIL(workspace_jobs_capacity_desired / workspace_host_capacity);
    IF (workspace_hosts_desired < 1) THEN
       workspace_hosts_desired := 1;
    END IF;

    -- Write data to the time_series table
    INSERT INTO time_series (name, value)
    VALUES
        ('workspace_jobs_capacity_desired', workspace_jobs_capacity_desired),
        ('workspace_hosts_desired', workspace_hosts_desired),
        ('workspace_hosts_launching_count', workspace_hosts_launching_count),
        ('workspace_hosts_ready_count', workspace_hosts_ready_count),
        ('workspace_hosts_draining_count', workspace_hosts_draining_count),
        ('workspace_hosts_unhealthy_count', workspace_hosts_unhealthy_count),
        ('workspace_hosts_terminating_count', workspace_hosts_terminating_count),
        ('workspace_hosts_active_count', workspace_hosts_active_count),
        ('workspace_hosts_longest_launching_sec', workspace_hosts_longest_launching_sec),
        ('workspace_hosts_longest_ready_sec', workspace_hosts_longest_ready_sec),
        ('workspace_hosts_longest_draining_sec', workspace_hosts_longest_draining_sec),
        ('workspace_hosts_longest_unhealthy_sec', workspace_hosts_longest_unhealthy_sec),
        ('workspace_hosts_longest_terminating_sec', workspace_hosts_longest_terminating_sec),
        ('workspace_uninitialized_count', workspace_uninitialized_count),
        ('workspace_launching_count', workspace_launching_count),
        ('workspace_relaunching_count', workspace_relaunching_count),
        ('workspace_running_count', workspace_running_count),
        ('workspace_running_on_healthy_hosts_count', workspace_running_on_healthy_hosts_count),
        ('workspace_active_count', workspace_active_count),
        ('workspace_active_on_healthy_hosts_count', workspace_active_on_healthy_hosts_count),
        ('workspace_longest_launching_sec', workspace_longest_launching_sec),
        ('workspace_longest_running_sec', workspace_longest_running_sec);

    -- CloudWatch timestamp
    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;
