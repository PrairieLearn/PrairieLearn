-- BLOCK select_workspace_hosts
SELECT * FROM workspace_hosts;

-- BLOCK update_workspaces_workspace_host_id
UPDATE
    workspaces as w
SET
    workspace_host_id = $workspace_host_id
WHERE
    w.id = $workspace_id;

-- BLOCK select_workspace_host
SELECT wh.*
FROM
    workspace_hosts AS wh
    JOIN workspaces AS w ON (w.workspace_host_id = wh.id)
WHERE w.id = $workspace_id;

-- BLOCK select_workspace
SELECT *
FROM workspaces
WHERE id = $workspace_id;

-- BLOCK select_workspace_paths
SELECT
    c.path AS course_path,
    q.qid
FROM
    pl_courses AS c
    JOIN questions AS q ON (q.course_id = c.id)
    JOIN variants AS v ON (v.question_id = q.id)
WHERE 
    v.workspace_id = $workspace_id;

-- BLOCK select_workspace_state
SELECT w.state
FROM workspaces as w
WHERE w.id = $workspace_id;
