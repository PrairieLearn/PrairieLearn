-- BLOCK select_workspace
SELECT
  w.version,
  w.state,
  wh.hostname,
  ($version = version) AS is_current_version
FROM
  workspaces AS w
  LEFT JOIN workspace_hosts AS wh ON (wh.id = w.workspace_host_id)
WHERE
  w.id = $workspace_id;

-- BLOCK select_workspace_logs
SELECT
  *,
  format_date_full_compact (date, $display_timezone) AS date_formatted
FROM
  workspace_logs
WHERE
  workspace_id = $workspace_id
  AND (
    $workspace_version::bigint IS NULL
    OR version = $workspace_version
  )
ORDER BY
  date ASC,
  id ASC;
