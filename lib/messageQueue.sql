-- BLOCK insert_grading_job
INSERT INTO grading_jobs
        (submission_id,  grading_type, external_grading_started_at, auth_user_id)
VALUES  $submission_id, $grading_type, current_timestamp,          $auth_user_id
RETURNING id;

-- BLOCK update_grading_submitted_time
UPDATE grading_jobs AS gj
SET
    grading_submitted_at = CURRENT_TIMESTAMP
WHERE
    gj.id = $grading_job_id

-- BLOCK local_update_grading_start_time
UPDATE grading_jobs AS gj
SET
    grading_started_at = CURRENT_TIMESTAMP
WHERE
    gj.id = $grading_job_id
