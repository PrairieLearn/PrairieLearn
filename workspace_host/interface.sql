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
SELECT w.*
FROM workspaces AS w
WHERE w.workspace_id = $workspace_id;

-- BLOCK get_workspace_id_by_uuid
SELECT w.id
FROM workspaces AS w
WHERE w.launch_uuid = $launch_uuid;

-- BLOCK set_workspace_launch_port
UPDATE workspaces AS w
SET launch_port = $port
WHERE w.id = $workspace_id;

-- BLOCK set_workspace_launch_uuid
UPDATE workspaces AS w
SET launch_uuid = $uuid
WHERE w.id = $workspace_id;

-- BLOCK get_workspace_host_used_ports
SELECT w.launch_port
FROM workspaces AS w
JOIN workspace_hosts AS wh ON w.workspace_host_id = wh.id
WHERE (w.state = 'launching' OR w.state = 'running') AND wh.instance_id = $instance_id AND w.launch_port IS NOT NULL
ORDER BY launch_port ASC;
