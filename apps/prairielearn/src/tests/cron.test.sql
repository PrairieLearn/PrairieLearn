-- BLOCK select_cron_jobs
SELECT
  *
FROM
  cron_jobs;

-- BLOCK select_unsuccessful_cron_jobs
SELECT
  *
FROM
  cron_jobs
WHERE
  succeeded_at IS NULL
  OR succeeded_at < date;
