-- BLOCK remove_grading_job_conflict
UPDATE grading_jobs
SET manual_grading_conflict = FALSE
WHERE id = $id;
