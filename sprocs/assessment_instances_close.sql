CREATE OR REPLACE FUNCTION
    assessment_instances_close (
        assessment_instance_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
<<main>>
DECLARE
    current_open boolean;
    duration interval;
BEGIN
    -- ######################################################################
    -- check everything is ok

    SELECT ai.open
    INTO current_open
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;

    IF NOT current_open THEN RETURN; END IF; -- don't error, just silently succeed

    -- ######################################################################
    -- compute the duration

    duration := assessment_instances_duration(assessment_instance_id);

    -- ######################################################################
    -- close the assessment instance and log it

    UPDATE assessment_instances AS ai
    SET
        open = FALSE,
        closed_at = CURRENT_TIMESTAMP,
        duration = main.duration
    WHERE ai.id = assessment_instance_id;

    INSERT INTO assessment_state_logs
            (open, assessment_instance_id,  auth_user_id)
    VALUES (false, assessment_instance_id, authn_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
