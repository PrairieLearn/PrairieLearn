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
    c.id AS course_id,
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

-- BLOCK select_workspace_version
SELECT w.version AS workspace_version
FROM workspaces AS w
WHERE w.id = $workspace_id;

-- BLOCK select_workspace_version_and_graded_files
SELECT
    w.version AS workspace_version,
    q.workspace_graded_files
FROM
    questions AS q
    JOIN variants AS v ON (v.question_id = q.id)
    JOIN workspaces AS w ON (v.workspace_id = w.id)
WHERE
    w.id = $workspace_id;

-- BLOCK update_workspace_heartbeat_at_now
UPDATE workspaces AS w
SET
    heartbeat_at = now()
WHERE
    w.id = $workspace_id
RETURNING
    heartbeat_at;

-- BLOCK update_workspace_homedir_location
UPDATE workspaces AS W
SET
    homedir_Location = $homedir_location
WHERE
    w.id = $workspace_id;
