CREATE OR REPLACE FUNCTION
    assessment_instances_close (
        assessment_instance_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
<<main>>
DECLARE
    duration interval;
BEGIN
    -- ######################################################################
    -- check everything is ok

    PERFORM assessment_instances_ensure_open(assessment_instance_id);

    -- ######################################################################
    -- compute the duration

    duration := assessment_instances_duration(assessment_instance_id);

    -- ######################################################################
    -- close the assessment instance and log it

    UPDATE assessment_instances AS ai
    SET
        open = FALSE,
        closed_at = CURRENT_TIMESTAMP,
        duration = main.duration,
        modified_at = now()
    WHERE ai.id = assessment_instance_id;

    INSERT INTO assessment_state_logs
            (open, assessment_instance_id,  auth_user_id)
    VALUES (false, assessment_instance_id, authn_user_id);

END;
$$ LANGUAGE plpgsql VOLATILE;
