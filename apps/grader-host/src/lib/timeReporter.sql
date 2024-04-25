-- BLOCK update_job_received_time
UPDATE grading_jobs
SET
  grading_received_at = NOW()
WHERE
  id = $job_id
RETURNING
  grading_jobs.grading_received_at AS time;

-- BLOCK update_job_start_time
UPDATE grading_jobs
SET
  grading_started_at = NOW()
WHERE
  id = $job_id
RETURNING
  grading_jobs.grading_started_at AS time;

-- BLOCK update_job_end_time
UPDATE grading_jobs
SET
  grading_finished_at = NOW()
WHERE
  id = $job_id
RETURNING
  grading_jobs.grading_finished_at AS time;
