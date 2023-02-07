CREATE FUNCTION
    workspace_hosts_assign_workspace(
        IN workspace_id bigint,
        IN capacity integer,
        OUT workspace_host_id bigint
    )
AS $$
BEGIN
    -- Select a random host that has capacity and lock it
    SELECT id INTO workspace_host_id
    FROM workspace_hosts AS wh
    WHERE
        wh.state = 'ready'
        AND wh.load_count < capacity
    ORDER BY random()
    LIMIT 1;

    IF (NOT FOUND) THEN
        RETURN; -- bail early if we couldn't find a host
    END IF;

    -- Assign the workspace to the chosen host
    UPDATE workspaces AS w
    SET workspace_host_id = workspace_hosts_assign_workspace.workspace_host_id
    WHERE w.id = workspace_id;

    -- Recompute the load_count on the chosen host
    UPDATE workspace_hosts as wh
    SET load_count = (
            SELECT count(*)
            FROM workspaces AS w
            WHERE w.workspace_host_id = wh.id AND (w.state = 'running' OR w.state = 'launching')
        )
    WHERE wh.id = workspace_host_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
