CREATE OR REPLACE FUNCTION
    workspace_loads_current(
        IN workspace_capacity_factor double precision,
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
        OUT workspaces_running_count integer,
        -- max time in each state
        OUT workspaces_longest_launching_sec double precision,
        OUT workspaces_longest_running_sec double precision,
        --
        OUT timestamp_formatted text
    )
AS $$
BEGIN
    -- Current number of running workspaces
    SELECT
        count(*) FILTER (WHERE w.state = 'uninitialized'),
        count(*) FILTER (WHERE w.state = 'stopped'),
        count(*) FILTER (WHERE w.state = 'launching'),
        count(*) FILTER (WHERE w.state = 'running')
    INTO
        workspaces_uninitialized_count,
        workspaces_stopped_count,
        workspaces_launching_count,
        workspaces_running_count
    FROM
        workspaces AS w;

    -- Longest running workspace in launching and running state
    SELECT
        COALESCE(max(extract(epoch FROM now() - state_updated_at)) FILTER (WHERE w.state = 'launching'), 0),
        COALESCE(max(extract(epoch FROM now() - state_updated_at)) FILTER (WHERE w.state = 'running'), 0)
    INTO
        workspaces_longest_launching_sec,
        workspaces_longest_running_sec
    FROM
        workspaces AS w;

    -- Current number of workspace hosts
    SELECT
        count(*) FILTER (WHERE wh.state = 'launching'),
        count(*) FILTER (WHERE wh.state = 'ready'),
        count(*) FILTER (WHERE wh.state = 'draining'),
        count(*) FILTER (WHERE wh.state = 'unhealthy'),
        count(*) FILTER (WHERE wh.state = 'terminating'),
        count(*) FILTER (WHERE wh.state = 'stopped')
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
        ('workspace_hosts_stopped_count', workspace_hosts_stopped_count),
        ('workspace_uninitialized_count', workspace_uninitialized_count),
        ('workspace_stopped_count', workspace_stopped_count),
        ('workspace_launching_count', workspace_launching_count),
        ('workspace_running_count', workspace_running_count),
        ('workspace_longest_launching_sec', workspace_longest_launching_sec),
        ('workspace_longest_running_sec', workspace_longest_running_sec);

    -- CloudWatch timestamp
    SET LOCAL timezone TO 'UTC';
    timestamp_formatted := to_char(now(), 'YYYY-MM-DD') || 'T' || to_char(now(), 'HH24:MI:SS') || 'Z';
END;
$$ LANGUAGE plpgsql VOLATILE;
