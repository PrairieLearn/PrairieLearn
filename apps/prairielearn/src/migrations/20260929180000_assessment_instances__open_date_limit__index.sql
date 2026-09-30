-- prairielearn:migrations NO TRANSACTION
-- Open timed exams are checked every minute for the end of the draft grace period.
CREATE INDEX CONCURRENTLY IF NOT EXISTS assessment_instances_open_date_limit_idx ON assessment_instances (date_limit)
WHERE
  open
  AND date_limit IS NOT NULL;
