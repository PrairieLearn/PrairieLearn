-- BLOCK lock_recovered_grading_job
-- Single-bigint advisory locks are separate from the two-integer locks used elsewhere.
SELECT
  pg_advisory_xact_lock($grading_job_id::bigint);

-- BLOCK keep_lock_alive
SELECT
  1;

-- BLOCK is_grading_job_finished
SELECT
  grading_request_canceled_at IS NOT NULL
  OR graded_at IS NOT NULL
FROM
  grading_jobs
WHERE
  id = $grading_job_id;
