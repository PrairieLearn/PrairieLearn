-- BLOCK select_recent_cron_job
SELECT *
FROM cron_jobs
WHERE
    name = $name
    AND date > now() - make_interval(secs => $interval_secs);

-- BLOCK update_cron_job_time
INSERT INTO cron_jobs
    (name, date)
VALUES
    ($name, now())
ON CONFLICT (name)
DO UPDATE
SET date = EXCLUDED.date;
