-- BLOCK insert_grading_log
INSERT INTO grading_logs
        (submission_id,  grading_type, external_grading_started_at, auth_user_id)
VALUES  $submission_id, $grading_type, current_timestamp,          $auth_user_id
RETURNING id;
