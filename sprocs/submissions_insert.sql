CREATE OR REPLACE FUNCTION
    submissions_insert(
        IN submitted_answer jsonb,
        IN raw_submitted_answer jsonb,
        IN parse_errors,
        IN gradable boolean,
        IN credit integer,
        IN mode enum_mode,
        IN variant_id bigint,
        IN authn_user_id bigint,
        OUT submission_id bigint
    )
AS $$
DECLARE
    variant variants%rowtype;
    instance_question_id bigint;
    assessment_instance_id bigint;
    last_access timestamptz;
    delta interval;
BEGIN
    -- ######################################################################
    -- get the variant

    -- we must have a variant, but we might not have an assessment_instance
    SELECT v.*,                    iq.id,                  ai.id
    INTO   variant, instance_question_id, assessment_instance_id
    FROM
        variants AS v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE v.id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid variant_id = %', variant_id; END IF

    IF NOT variant.available THEN
        RAISE EXCEPTION 'variant is not available';
    END IF;

    -- ######################################################################
    -- locking

    -- lock the assessment_instance if we have one, otherwise lock the variant
    IF assessment_instance_id IS NOT NULL THEN
        PERFORM ai.id FROM assessment_instances AS ai
        WHERE ai.id = assessment_instance_id FOR UPDATE OF ai;
    ELSE
        PERFORM v.id FROM variants AS v
        WHERE v.id = variant_id FOR UPDATE OF v;
    END IF;

    -- ######################################################################
    -- figure out the elapsed time since the last access

    SELECT la.last_access
    INTO last_access
    FROM last_accesses AS la
    WHERE la.user_id = variant.user_id;

    delta := coalesce(now() - last_access, interval '0 seconds');
    IF delta > interval '1 hour' THEN
        delta := interval '0 seconds';
    END IF;

    UPDATE last_accesses AS la
    SET last_access = now()
    WHERE la.user_id = variant.user_id;

    -- ######################################################################
    -- actually insert the submission

    INSERT INTO submissions
            (variant_id, auth_user_id,  raw_submitted_answer, submitted_answer, parse_errors,
            type, credit, mode, duration,         params,         true_answer)
    VALUES  (variant_id, authn_user_id, raw_submitted_answer, submitted_answer, parse_errors,
            type, credit, mode, delta,    variant.params, variant.true_answer)
    RETURNING id
    INTO submission_id;

    -- ######################################################################
    -- update parent objects

    UPDATE variants
    SET
        duration = duration + delta,
        first_duration = coalesce(first_duration, delta)
    WHERE id = variant_id;

    IF assessment_instance_id IS NOT NULL THEN
        UPDATE instance_questions
        SET
            status = 'saved',
            duration = duration + delta,
            first_duration = coalesce(first_duration, delta)
        WHERE id = instance_question_id;

        UPDATE assessment_instances AS ai
        SET duration = ai.duration + delta
        FROM instance_questions AS iq
        WHERE
            iq.id = instance_question_id
            AND ai.id = iq.assessment_instance_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
