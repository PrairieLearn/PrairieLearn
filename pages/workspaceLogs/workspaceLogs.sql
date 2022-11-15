-- BLOCK select_workspace_logs
SELECT
    format_date_full_compact(date, $display_timezone) AS date,
    message,
    version,
    state
FROM workspace_logs
WHERE workspace_id = $workspace_id
ORDER BY date ASC, id ASC;

-- BLOCK select_workspace_version_logs
SELECT
    format_date_full_compact(date, $display_timezone) AS date,
    message,
    version,
    state
FROM workspace_logs
WHERE
    workspace_id = $workspace_id
    AND version = $version
ORDER BY date ASC, id ASC;
