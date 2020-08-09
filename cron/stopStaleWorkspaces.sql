-- BLOCK select_stale_workspaces
SELECT
    *
FROM
    workspaces AS w
WHERE
    w.state = 'running'::enum_workspace_state
    AND (
        w.launched_at < now() - make_interval(seconds => $launched_timeout_sec)
        OR w.heartbeat_at < now() - make_interval(seconds => $heartbeat_timeout_sec)
    );
