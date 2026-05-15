-- BLOCK select_unfinished_cron_jobs
SELECT
  name,
  date
FROM
  cron_jobs
WHERE
  (
    succeeded_at IS NULL
    OR succeeded_at < date
  )
  AND name != 'sendUnfinishedCronWarnings'
  AND date > now() - interval '36 hours';
