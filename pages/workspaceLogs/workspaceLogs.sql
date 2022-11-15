-- BLOCK select_workspace_logs
SELECT
    format_date_full_compact(date, $display_timezone) AS date,
    message,
    version,
    state
FROM workspace_logs
WHERE workspace_id = $workspace_id;
