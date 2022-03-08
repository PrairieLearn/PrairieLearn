CREATE FUNCTION
    grading_jobs_insert(
        IN submission_id bigint,
        IN authn_user_id bigint,
        OUT grading_job grading_jobs
    )
AS $$
<<main>>
DECLARE
    credit integer;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    grading_method enum_grading_method;
BEGIN
    PERFORM submissions_lock(submission_id);

    -- ######################################################################
    -- get the related objects

    -- we must have a variant, but we might not have an assessment_instance
    SELECT s.credit,       v.id, q.grading_method,                iq.id,                  ai.id
    INTO     credit, variant_id,   grading_method, instance_question_id, assessment_instance_id
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;

    -- ######################################################################
    -- cancel any outstanding grading jobs

    WITH canceled_jobs AS (
        UPDATE grading_jobs AS gj
        SET
            grading_request_canceled_at = now(),
            grading_request_canceled_by = grading_jobs_insert.authn_user_id
        FROM
            variants AS v
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            v.id = main.variant_id
            AND gj.submission_id = s.id
            AND gj.graded_at IS NULL
            AND gj.grading_requested_at IS NOT NULL
            AND gj.grading_request_canceled_at IS NULL
        RETURNING gj.*
    )
    UPDATE submissions AS s
    SET grading_requested_at = NULL
    FROM canceled_jobs
    WHERE s.id = canceled_jobs.submission_id;

    -- ######################################################################
    -- insert the new grading job

    INSERT INTO grading_jobs AS gj (
        submission_id,
        auth_user_id,
        grading_method,
        grading_requested_at,
        grading_received_at,
        grading_started_at
    ) VALUES (
        submission_id,
        authn_user_id,
        grading_method,
        now(),
        -- For internal grading jobs, we can just use the same timestamp for
        -- all of these. When we're grading manually or externally, these will
        -- be set when the grading job is actually "processed".
        CASE WHEN grading_method = 'Internal' THEN now() ELSE NULL END,
        CASE WHEN grading_method = 'Internal' THEN now() ELSE NULL END
    )
    RETURNING gj.*
    INTO grading_job;

    -- ######################################################################
    -- update the submission

    UPDATE submissions AS s
    SET
        grading_requested_at = now(),
        grading_method = main.grading_method
    WHERE s.id = submission_id;

    -- ######################################################################
    -- update all parent objects

    IF assessment_instance_id IS NOT NULL THEN
        PERFORM instance_questions_update_in_grading(instance_question_id, authn_user_id);
        PERFORM assessment_instances_grade(assessment_instance_id, authn_user_id, credit);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
