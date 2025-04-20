-- BLOCK select_workspace_host
SELECT
  wh.*
FROM
  workspace_hosts AS wh
  JOIN workspaces AS w ON (w.workspace_host_id = wh.id)
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id;

-- BLOCK select_and_lock_workspace
SELECT
  *
FROM
  workspaces
WHERE
  id = $workspace_id
FOR NO KEY UPDATE;

-- BLOCK select_workspace_data
SELECT
  to_jsonb(w.*) AS workspace,
  to_jsonb(v.*) AS variant,
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course
FROM
  workspaces AS w
  JOIN variants AS v ON (v.workspace_id = w.id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN pl_courses AS c ON (c.id = q.course_id)
WHERE
  w.id = $workspace_id;

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
