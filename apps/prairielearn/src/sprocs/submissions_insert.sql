CREATE FUNCTION
    submissions_insert(
        IN submitted_answer jsonb,
        IN raw_submitted_answer jsonb,
        IN format_errors jsonb,
        IN gradable boolean,
        IN broken boolean,
        IN new_true_answer jsonb,
        IN feedback jsonb,
        IN regradable boolean,
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
    new_status enum_instance_question_status;
    aq_manual_points double precision;
BEGIN
    PERFORM variants_lock(variant_id);

    -- ######################################################################
    -- update the variant's `correct_answer`, which is permitted to change
    -- during the `parse` phase (which occurs before this submission is
    -- inserted).
    UPDATE variants SET true_answer = new_true_answer WHERE id = variant_id;

    -- ######################################################################
    -- get the variant

    SELECT v.* INTO variant FROM variants AS v WHERE v.id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid variant_id = %', variant_id; END IF;
    
    -- we must have a variant, but we might not have an assessment_instance
    SELECT
        iq.id,
        ai.id,
        COALESCE(aq.max_manual_points, 0)
    INTO
        instance_question_id,
        assessment_instance_id,
        aq_manual_points
    FROM
        variants AS v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
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
    WHERE (CASE WHEN variant.user_id IS NOT NULL THEN la.user_id = variant.user_id 
                ELSE la.group_id = variant.group_id
            END);

    delta := coalesce(now() - last_access, interval '0 seconds');
    IF delta > interval '1 hour' THEN
        delta := interval '0 seconds';
    END IF;

    UPDATE last_accesses AS la
    SET last_access = now()
    WHERE (CASE WHEN variant.user_id IS NOT NULL THEN la.user_id = variant.user_id 
                ELSE la.group_id = variant.group_id
            END);

    -- ######################################################################
    -- actually insert the submission

    INSERT INTO submissions
            (variant_id, auth_user_id, raw_submitted_answer, submitted_answer, format_errors,
            credit, mode, duration, params, true_answer, feedback, gradable, broken, regradable)
    VALUES  (variant_id, authn_user_id, raw_submitted_answer, submitted_answer, format_errors,
            credit, mode, delta, variant.params, variant.true_answer, feedback, gradable, broken, regradable)
    RETURNING id
    INTO submission_id;

    -- ######################################################################
    -- update parent objects

    UPDATE variants
    SET
        duration = duration + delta,
        first_duration = coalesce(first_duration, delta)
    WHERE id = variant_id;

    new_status := 'saved';
    IF gradable = FALSE THEN new_status := 'invalid'; END IF;

    IF assessment_instance_id IS NOT NULL THEN
        UPDATE instance_questions
        SET
            status = new_status,
            duration = duration + delta,
            first_duration = coalesce(first_duration, delta),
            modified_at = now(),
            requires_manual_grading = requires_manual_grading OR aq_manual_points > 0
        WHERE id = instance_question_id;

        -- Update the stats, in particular the submission score array. Initial
        -- updates only involve a null entry, which is updated after grading if
        -- the submission is graded.
        PERFORM instance_questions_calculate_stats(instance_question_id);

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
