-- BLOCK update_grading_start_time
UPDATE grading_jobs AS gj
SET
    grading_started_at = $start_time
WHERE
    gj.id = $grading_job_id
