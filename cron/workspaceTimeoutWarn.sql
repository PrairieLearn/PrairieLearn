-- BLOCK select_almost_launched_timeout_workspaces
SELECT
    w.id,
    DATE_PART('epoch', (w.launched_at + make_interval(secs => $launched_timeout_sec) - now()))::int AS time_to_timeout_sec
FROM workspaces AS w
WHERE
    w.state = 'running'::enum_workspace_state
    AND w.launched_at < now() - make_interval(secs => $launched_timeout_sec::int - $launched_timeout_warn_sec::int);
