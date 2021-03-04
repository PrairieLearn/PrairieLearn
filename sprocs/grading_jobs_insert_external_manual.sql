CREATE OR REPLACE FUNCTION
    grading_jobs_insert_external_manual (
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
    grading_method_internal boolean;
    grading_method_external boolean;
    grading_method_manual boolean;
BEGIN
    -- ######################################################################
    -- get the related objects

    -- we must have a variant, but we might not have an assessment_instance
    SELECT s.credit,       v.id, q.grading_method_internal, q.grading_method_external, q.grading_method_manual,                iq.id,                  ai.id
    INTO     credit, variant_id,   grading_method_internal,   grading_method_external,   grading_method_manual, instance_question_id, assessment_instance_id
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;
    IF grading_method_external != True AND grading_method_manual != True THEN
        RAISE EXCEPTION 'grading_method is not External or Manual for submission_id: %', submission_id;
    END IF;

    -- ######################################################################
    -- cancel any outstanding grading jobs
    -- TODO: w/ the new workflows, check how to prevent deleteing other grading job types
    --          Do we re-introduce a grading_job_enum to help

    FOR grading_job IN
        UPDATE grading_jobs AS gj
        SET
            grading_request_canceled_at = now(),
            grading_request_canceled_by = grading_jobs_insert_external_manual.authn_user_id
        FROM
            variants AS v
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            v.id = main.variant_id
            AND gj.submission_id = s.id
            AND gj.graded_at IS NULL
            AND gj.grading_requested_at IS NOT NULL
            AND gj.grading_request_canceled_at IS NULL
            -- TODO: possible add gj.grading_job_type in here
        RETURNING gj.*
    LOOP
        UPDATE submissions AS s
        SET grading_requested_at = NULL
        WHERE s.id = grading_job.submission_id;
    END LOOP;

    -- ######################################################################
    -- insert the new grading job

    INSERT INTO grading_jobs AS gj
        (submission_id,  auth_user_id, grading_method_internal,   grading_method_external,   grading_method_manual, grading_requested_at)
    VALUES
        (submission_id, authn_user_id, grading_method_internal,   grading_method_external,   grading_method_manual, now())
    RETURNING gj.*
    INTO grading_job;

    -- ######################################################################
    -- update the submission

    UPDATE submissions AS s
    SET
        grading_requested_at = now(),
        -- TODO: Do we need to update the grading methods here? Why are we doing this?
        grading_method_internal = main.grading_method_internal,
        grading_method_external = main.grading_method_external,
        grading_method_manual   = main.grading_method_manual
    WHERE s.id = submission_id;

    -- ######################################################################
    -- update all parent objects

    IF assessment_instance_id IS NOT NULL THEN
        PERFORM instance_questions_update_in_grading(instance_question_id, authn_user_id);
        PERFORM assessment_instances_grade(assessment_instance_id, authn_user_id, credit);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
