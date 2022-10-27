CREATE FUNCTION
    assessment_instances_close (
        assessment_instance_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
<<main>>
DECLARE
    duration interval;
BEGIN
    -- Lock the assessment instance to guard against concurrent updates.
    PERFORM assessment_instances_lock(assessment_instance_id);

    -- Ensure that the assessment instance is still open. This ensures that
    -- users can't force a regrade by trying to close an assessment instance
    -- that's already closed.
    PERFORM assessment_instances_ensure_open(assessment_instance_id);

    -- Compute the duration.
    duration := assessment_instances_duration(assessment_instance_id);

    -- Close the assessment instance and update the metadata.
    UPDATE assessment_instances AS ai
    SET
        open = FALSE,
        closed_at = CURRENT_TIMESTAMP,
        duration = main.duration,
        modified_at = now(),
        -- Mark the assessment instance as in need of grading. We'll start
        -- grading immediately, but in case the PrairieLearn process dies in
        -- the middle of grading, the `autoFinishExams` cronjob will grade the
        -- assessment instance at some point in the near future.
        grading_needed = TRUE
    WHERE ai.id = assessment_instance_id;

    -- Log the new assessment instance state.
    INSERT INTO assessment_state_logs
            (open, assessment_instance_id,  auth_user_id)
    VALUES (false, assessment_instance_id, authn_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
