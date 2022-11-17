-- BLOCK select_workspace
SELECT
    w.version,
    wh.hostname,
    ($version = version) AS is_current_version
FROM
    workspaces AS w
    LEFT JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE w.id = $workspace_id;

-- BLOCK select_workspace_logs
SELECT
    date,
    format_date_full_compact(date, $display_timezone) AS date_formatted,
    message,
    version,
    state
FROM workspace_logs
WHERE workspace_id = $workspace_id
ORDER BY date ASC, id ASC;

-- BLOCK select_workspace_version_logs
SELECT
    date,
    format_date_full_compact(date, $display_timezone) AS date_formatted,
    message,
    version,
    state
FROM workspace_logs
WHERE
    workspace_id = $workspace_id
    AND version = $version
ORDER BY date ASC, id ASC;
