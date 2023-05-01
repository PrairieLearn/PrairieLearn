ALTER TABLE cron_jobs
ADD COLUMN succeeded_at timestamp with time zone;
