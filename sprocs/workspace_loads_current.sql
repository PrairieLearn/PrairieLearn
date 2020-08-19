CREATE OR REPLACE FUNCTION
    workspace_loads_current(
        IN workspace_capacity_factor double precision
        IN workspace_host_capacity integer,
        OUT workspace_jobs_capacity_desired integer,
        OUT workspace_hosts_desired integer,
        -- workspace hosts in each state
        OUT workspace_hosts_launching_count integer,
        OUT workspace_hosts_ready_count integer,
        OUT workspace_hosts_draining_count integer,
        OUT workspace_hosts_unhealthy_count integer,
        OUT workspace_hosts_terminating_count integer,
        OUT workspace_hosts_stopped_count integer,
        -- workspaces in each state
        OUT workspaces_uninitialized_count integer,
        OUT workspaces_stopped_count integer,
        OUT workspaces_launching_count integer,
        OUT workspaces_running_count integer
        --
        OUT timestamp_formatted text
    )
AS $$
BEGIN
    -- Current number of running workspaces
    SELECT
        count(*) FILTER (w.state = 'uninitialized'),
        count(*) FILTER (w.state = 'stopped'),
        count(*) FILTER (w.state = 'launching'),
        count(*) FILTER (w.state = 'running'),
    INTO
        workspaces_uninitialized_count,
        workspaces_stopped_count,
        workspaces_launching_count,
        workspaces_running_count
    FROM
        workspaces AS w;

    -- Current number of workspace hosts
    SELECT
        count(*) FILTER (wh.state = 'launching'),
        count(*) FILTER (wh.state = 'ready'),
        count(*) FILTER (wh.state = 'draining'),
        count(*) FILTER (wh.state = 'unhealthy'),
        count(*) FILTER (wh.state = 'terminating'),
        count(*) FILTER (wh.state = 'stopped')
    INTO
        workspace_hosts_launching_count,
        workspace_hosts_ready_count,
        workspace_hosts_draining_count,
        workspace_hosts_unhealthy_count,
        workspace_hosts_terminating_count,
        workspace_hosts_stopped_count
    FROM
        workspace_hosts AS wh;

    -- Compute desired number of workspace hosts
    workspace_jobs_capacity_desired := (workspace_running_count * workspace_capacity_factor) + 2 * SQRT(workspace_running_count * workspace_capacity_factor);
    workspace_hosts_desired := CEIL(workspace_capacity_desired / workspace_jobs_host_capacity);
    IF (workspace_hosts_desired < 1) THEN
       workspace_hosts_desired := 1;
    END

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
        ('workspace_hosts_stopped_count', workspace_hosts_stopped_count),
        ('workspace_uninitialized_count', workspace_uninitialized_count),
        ('workspace_stopped_count', workspace_stopped_count),
        ('workspace_launching_count', workspace_launching_count),
        ('workspace_running_count', workspace_running_count);

    -- CloudWatch timestamp
    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;
