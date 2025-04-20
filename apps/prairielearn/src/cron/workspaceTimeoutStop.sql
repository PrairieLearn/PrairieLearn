-- BLOCK select_launched_timeout_workspaces
SELECT
  *
FROM
  workspaces AS w
WHERE
  w.state = 'running'::enum_workspace_state
  AND w.launched_at < now() - make_interval(secs => $launched_timeout_sec);

-- BLOCK select_heartbeat_timeout_workspaces
SELECT
  *
FROM
  workspaces AS w
WHERE
  w.state = 'running'::enum_workspace_state
  AND w.heartbeat_at < now() - make_interval(secs => $heartbeat_timeout_sec);

-- BLOCK select_in_launching_timeout_workspaces
SELECT
  *
FROM
  workspaces AS w
WHERE
  w.state = 'launching'::enum_workspace_state
  AND w.launched_at < now() - make_interval(secs => $in_launching_timeout_sec);
