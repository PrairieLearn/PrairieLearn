-- BLOCK select_workspace_settings
SELECT
    q.*
FROM
    questions AS q
    JOIN variants AS v ON (v.question_id = q.id)
WHERE
    v.workspace_id = $workspace_id;

-- BLOCK update_workspace_hostname
UPDATE workspaces AS w
SET
    hostname = $hostname
WHERE
    w.id = $workspace_id;

-- BLOCK update_workspace_launched_at_now
UPDATE workspaces AS w
SET
    launched_at = now()
WHERE
    w.id = $workspace_id;

-- BLOCK insert_workspace_hosts
INSERT INTO workspace_hosts
        (instance_id,  hostname)
VALUES ($instance_id, $hostname)
ON CONFLICT (instance_id) DO UPDATE
SET hostname = EXCLUDED.hostname;

-- BLOCK update_load_count
UPDATE workspace_hosts as wh
SET
    load_count = load_count + $count
FROM
    workspaces as w
WHERE
    w.id = $workspace_id
    AND w.workspace_host_id = wh.id;

-- BLOCK get_workspace
SELECT
    w.*
FROM
    workspaces AS w
JOIN
    workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE
    w.id = $workspace_id AND wh.instance_id = $instance_id;

-- BLOCK get_workspace_id_by_uuid
SELECT
    w.id
FROM
    workspaces AS w
JOIN
    workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE
    w.launch_uuid = $launch_uuid AND wh.instance_id = $instance_id;

-- BLOCK set_workspace_launch_uuid
UPDATE
    workspaces AS w
SET
    launch_uuid = $launch_uuid
FROM
    workspace_hosts AS wh
WHERE
    w.id = $workspace_id AND wh.instance_id = $instance_id;

-- BLOCK set_workspace_launch_port
UPDATE
    workspaces AS w
SET
    launch_port = $launch_port
FROM
    workspace_hosts AS wh
WHERE
    w.id = $workspace_id AND wh.instance_id = $instance_id;

-- BLOCK get_is_port_occupied
SELECT
    EXISTS(
        SELECT 1 AS dummy
        FROM workspaces AS w
        JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
        WHERE wh.instance_id = $instance_id AND w.launch_port = $port
    ) AS port_used;

-- BLOCK get_running_workspaces
SELECT
    w.*
FROM
    workspaces AS w
JOIN
    workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
    (w.state = 'launching' OR w.state = 'running')
    AND w.launch_uuid IS NOT NULL
    AND wh.instance_id = $instance_id;

-- BLOCK get_stopped_workspaces
SELECT
    w.*
FROM
    workspaces AS w
JOIN
    workspace_hosts AS wh ON (w.workspace_host_id = wh.id)
WHERE
    w.state = 'stopped'
    AND wh.instance_id = $instance_id;

-- BLOCK clear_workspace_on_shutdown
UPDATE
    workspaces AS w
SET
    launch_uuid = NULL
    launch_port = NULL
    workspace_host_id = NULL
FROM
    workspace_hosts AS wh
WHERE
    w.id = $workspace_id AND wh.instance_id = $instance_id;
