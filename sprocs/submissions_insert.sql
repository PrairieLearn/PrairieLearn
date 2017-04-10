CREATE OR REPLACE FUNCTION
    submissions_insert(
        IN instance_question_id bigint,
        IN authn_user_id bigint,
        IN submitted_answer jsonb,
        IN type enum_submission_type,
        IN credit integer,
        IN mode enum_mode,
        IN variant_id bigint DEFAULT NULL,
        OUT submission_id bigint
    )
AS $$
<<main>>
DECLARE
    variant variants%rowtype;
    user_id bigint;
    last_access timestamptz;
    delta interval;
BEGIN
    -- ######################################################################
    -- get the variant

    IF variant_id IS NULL THEN
        SELECT v.*
        INTO variant
        FROM variants AS v
        WHERE v.instance_question_id = submissions_insert.instance_question_id
        ORDER BY v.date DESC
        LIMIT 1;

        IF NOT FOUND THEN RAISE EXCEPTION 'variant not found'; END IF;

        variant_id := variant.id;
    ELSE
        SELECT * INTO variant FROM variants WHERE id = variant_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'variant not found'; END IF;
    END IF;

    IF variant.instance_question_id != instance_question_id THEN
        RAISE EXCEPTION 'instance_question_id mismatch';
    END IF;

    IF NOT variant.available THEN
        RAISE EXCEPTION 'variant is not available';
    END IF;

    -- ######################################################################
    -- figure out the elapsed time since the last access

    SELECT ai.user_id INTO user_id
    FROM
        assessment_instances AS ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
    WHERE iq.id = instance_question_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'instance_question not found'; END IF;

    SELECT la.last_access
    INTO last_access
    FROM last_accesses AS la
    WHERE la.user_id = main.user_id;

    delta := coalesce(current_timestamp - last_access, interval '0 seconds');
    IF delta > interval '1 hour' THEN
        delta := interval '0 seconds';
    END IF;

    UPDATE last_accesses AS la
    SET last_access = current_timestamp
    WHERE la.user_id = main.user_id;

    -- ######################################################################
    -- actually insert the submission

    INSERT INTO submissions
            (variant_id, auth_user_id,  submitted_answer, type, credit, mode, duration)
    VALUES  (variant_id, authn_user_id, submitted_answer, type, credit, mode, delta)
    RETURNING id
    INTO submission_id;

    -- ######################################################################
    -- update durations for parent objects

    UPDATE variants
    SET
        duration = duration + delta,
        first_duration = CASE WHEN first_duration IS NULL THEN delta ELSE first_duration END
    WHERE id = variant_id;

    UPDATE instance_questions
    SET
        status = 'saved',
        duration = duration + delta,
        first_duration = CASE WHEN first_duration IS NULL THEN delta ELSE first_duration END
    WHERE id = instance_question_id;

    UPDATE assessment_instances AS ai
    SET duration = ai.duration + delta
    FROM instance_questions AS iq
    WHERE
        iq.id = instance_question_id
        AND ai.id = iq.assessment_instance_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
