-- BLOCK update_job_received_time
UPDATE grading_jobs
SET
    grading_received_at = $time
WHERE
    id = $job_id;

-- BLOCK update_job_start_time
UPDATE grading_jobs
SET
    grading_started_at = $time
WHERE
    id = $job_id;

-- BLOCK update_job_end_time
UPDATE grading_jobs
SET
    grading_finished_at = $time
WHERE
    id = $job_id;
