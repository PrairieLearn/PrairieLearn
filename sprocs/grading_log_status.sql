CREATE OR REPLACE FUNCTION
    grading_log_status(
        grading_log_id bigint
    ) RETURNS TEXT AS $$
DECLARE
    log grading_logs;
BEGIN
    SELECT gl.* INTO log
    FROM
        grading_logs AS gl
    WHERE
        gl.id = grading_log_id;

    IF log.graded_at IS NOT NULL THEN
        RETURN 'graded';
    END IF;

    IF log.grading_finished_at IS NOT NULL THEN
        RETURN 'processing';
    END IF;

    IF log.grading_started_at IS NOT NULL THEN
        RETURN 'grading';
    END IF;

    IF log.grading_submitted_at IS NOT NULL THEN
        RETURN 'queued';
    END IF;

    RETURN 'requested';
END;
$$ LANGUAGE plpgsql STABLE;
