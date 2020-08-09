-- BLOCK select_stale_workspaces
SELECT
    *
FROM
    workspaces AS w
WHERE
    w.state = 'running'::enum_workspace_state
    AND (
        w.launched_at < now() - ($launched_timeout_sec || ' seconds')::interval
        OR w.heartbeat_at < now() - ($heartbeat_timeout_sec || ' seconds')::interval
    );
