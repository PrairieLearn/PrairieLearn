CREATE OR REPLACE FUNCTION
    grading_job_status(
        grading_job_id bigint
    ) RETURNS TEXT AS $$
DECLARE
    job grading_jobs;
BEGIN
    SELECT gj.* INTO job
    FROM
        grading_jobs AS gj
    WHERE
        gj.id = grading_job_id;

    IF job.graded_at IS NOT NULL THEN
        RETURN 'graded';
    END IF;

    IF job.grading_finished_at IS NOT NULL THEN
        RETURN 'processing';
    END IF;

    IF job.grading_started_at IS NOT NULL THEN
        RETURN 'grading';
    END IF;

    IF job.grading_submitted_at IS NOT NULL THEN
        RETURN 'queued';
    END IF;

    RETURN 'requested';
END;
$$ LANGUAGE plpgsql STABLE;
