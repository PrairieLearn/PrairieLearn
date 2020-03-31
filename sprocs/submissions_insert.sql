DROP FUNCTION IF EXISTS submissions_insert(jsonb,jsonb,jsonb,boolean,integer,enum_mode,bigint,bigint,bigint);
DROP FUNCTION IF EXISTS submissions_insert(jsonb,jsonb,jsonb,boolean,boolean,integer,enum_mode,bigint,bigint,bigint);

CREATE OR REPLACE FUNCTION
    submissions_insert(
        IN submitted_answer jsonb,
        IN raw_submitted_answer jsonb,
        IN format_errors jsonb,
        IN gradable boolean,
        IN broken boolean,
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
    PERFORM variants_lock(variant_id);

    -- ######################################################################
    -- get the variant

    SELECT v.* INTO variant FROM variants AS v WHERE v.id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid variant_id = %', variant_id; END IF;
    
    -- we must have a variant, but we might not have an assessment_instance
    SELECT              iq.id,                  ai.id
    INTO instance_question_id, assessment_instance_id
    FROM
        variants AS v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE v.id = variant_id;

    -- ######################################################################
    -- make sure everything is ok

    IF variant.broken THEN
        RAISE EXCEPTION 'variant is broken: %', variant_id;
    END IF;

    PERFORM variants_ensure_open(variant_id);

    IF instance_question_id IS NOT NULL THEN
        PERFORM instance_questions_ensure_open(instance_question_id);
    END IF;

    IF assessment_instance_id IS NOT NULL THEN
        PERFORM assessment_instances_ensure_open(assessment_instance_id);
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
            (variant_id, auth_user_id,  raw_submitted_answer, submitted_answer, format_errors,
            credit, mode, duration,         params,         true_answer, gradable, broken)
    VALUES  (variant_id, authn_user_id, raw_submitted_answer, submitted_answer, format_errors,
            credit, mode, delta,    variant.params, variant.true_answer, gradable, broken)
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
            first_duration = coalesce(first_duration, delta),
            modified_at = now()
        WHERE id = instance_question_id;

        UPDATE assessment_instances AS ai
        SET
            duration = ai.duration + delta,
            modified_at = now()
        FROM instance_questions AS iq
        WHERE
            iq.id = instance_question_id
            AND ai.id = iq.assessment_instance_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
