-- BLOCK select_workspace_settings
SELECT
    workspace_image,
    workspace_port,
    workspace_args,
    workspace_home,
    workspace_graded_files,
    workspace_url_rewrite
FROM
    questions AS q
    JOIN variants AS v ON (v.question_id = q.id)
WHERE
    v.workspace_id = $workspace_id;

-- BLOCK insert_workspace_hosts
INSERT INTO workspace_hosts
    (hostname)
VALUES
    ($hostname);

-- BLOCK increment_load_count
UPDATE workspace_hosts as wh
SET
    load_count = load_count + 1
FROM
    workspaces as w
WHERE
    w.id = $workspace_id
    AND w.workspace_host_id = wh.id;

-- BLOCK decrement_load_count
UPDATE workspace_hosts as wh
SET
    load_count = load_count - 1
FROM
    workspaces as w
WHERE
    w.id = $workspace_id
    AND w.workspace_host_id = wh.id;
