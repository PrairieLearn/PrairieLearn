CREATE OR REPLACE FUNCTION
    grading_job_status(
        grading_job_id bigint
    ) RETURNS TEXT AS $$
DECLARE
    job grading_jobs;
BEGIN
    IF grading_job_id IS NULL THEN
        RETURN 'none';
    END IF;

    SELECT gj.* INTO job
    FROM
        grading_jobs AS gj
    WHERE
        gj.id = grading_job_id;

    IF job.grading_request_canceled_at IS NOT NULL THEN
        RETURN 'canceled';
    END IF;
    IF job.graded_at IS NOT NULL THEN
        RETURN 'graded';
    END IF;

    IF job.grading_received_at IS NOT NULL THEN
        RETURN 'grading';
    END IF;

    IF job.grading_submitted_at IS NOT NULL THEN
        RETURN 'queued';
    END IF;

    RETURN 'requested';
END;
$$ LANGUAGE plpgsql STABLE;
