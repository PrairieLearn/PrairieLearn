-- BLOCK insert_grading_log
INSERT INTO grading_logs
        (submission_id,  grading_type, external_grading_started_at, auth_user_id)
VALUES  $submission_id, $grading_type, current_timestamp,          $auth_user_id
RETURNING id;

-- BLOCK update_grading_submitted_time
UPDATE grading_logs AS gl
SET
    grading_submitted_at = CURRENT_TIMESTAMP
WHERE
    gl.id = $grading_log_id
