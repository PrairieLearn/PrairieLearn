-- prairielearn:migrations NO TRANSACTION
-- Intentionally fail if a previous concurrent build left an invalid index.
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY job_sequences_ongoing_idx ON job_sequences (type)
WHERE
  status IN ('Running', 'Stopping');
