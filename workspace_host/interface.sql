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
