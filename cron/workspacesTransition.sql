-- select_nonstopped_workspace_hosts
SELECT
    wh.*,
    COUNT(
        SELECT 1
        FROM workspaces AS w
        WHERE (workspace_host_id = wh.id) AND (w.state = 'launching' OR w.state = 'running')
    ) AS job_count
FROM workspace_hosts AS wh
WHERE wh.state != 'stopped';
