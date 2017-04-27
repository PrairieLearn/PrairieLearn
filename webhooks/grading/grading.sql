-- BLOCK update_grading_start_time
UPDATE grading_logs AS gl
SET
    grading_started_at = $start_time
WHERE
    gl.id = $grading_log_id
