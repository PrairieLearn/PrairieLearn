-- BLOCK select_unfinished_cron_jobs
SELECT
  name,
  format_date_iso8601 (date, NULL) as formatted_started_at
FROM
  cron_jobs
WHERE
  (
    succeeded_at IS NULL
    OR succeeded_at < date
  )
  AND name != 'sendUnfinishedCronWarnings';
