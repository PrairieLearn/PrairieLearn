-- BLOCK update_grading_submitted_time
UPDATE grading_jobs AS gj
SET
    grading_submitted_at = $grading_submitted_at
WHERE
    gj.id = $grading_job_id;

-- BLOCK select_grading_jobs
SELECT id FROM grading_jobs;
