WITH
  workspace_log_intervals AS (
    SELECT
      wl.workspace_id,
      CASE
        WHEN (lag(wl.state) OVER win) = 'launching' THEN wl.date - (lag(wl.date) OVER win)
        ELSE make_interval(secs => 0)
      END AS duration
    FROM
      workspace_logs AS wl
    WHERE
      wl.state IS NOT NULL
    WINDOW
      win AS (
        PARTITION BY
          wl.workspace_id
        ORDER BY
          wl.date,
          wl.id
      )
  ),
  workspace_durations AS (
    SELECT
      wli.workspace_id,
      SUM(wli.duration) AS duration
    FROM
      workspace_log_intervals AS wli
    GROUP BY
      wli.workspace_id
  )
UPDATE workspaces AS w
SET
  launching_duration = wd.duration
FROM
  workspace_durations AS wd
WHERE
  w.id = wd.workspace_id;
