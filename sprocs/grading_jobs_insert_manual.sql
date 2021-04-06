DROP FUNCTION IF EXISTS grading_jobs_insert_manual(bigint, bigint, double precision, jsonb);

CREATE OR REPLACE FUNCTION
    grading_jobs_insert_manual (
        IN arg_submission_id bigint,
        IN arg_authn_user_id bigint,
        IN arg_manual_grade_score double precision, -- decimal percent divisible by 5
        IN arg_manual_grade_feedback jsonb,
        OUT grading_job grading_jobs
    )
AS $$
<<main>>
DECLARE
    credit integer;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    grading_jobs grading_jobs%rowtype;
    grading_method enum_grading_method;
BEGIN

    -- Update the given score for the assessment.

    -- ######################################################################
    -- get the related objects

    -- we must have a variant, but we might not have an assessment_instance
    SELECT s.credit,       v.id,                 iq.id,                  ai.id
    INTO     credit, variant_id,  instance_question_id, assessment_instance_id
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE s.id = arg_submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such arg_submission_id: %', arg_submission_id; END IF;
    IF grading_method != 'Manual'::enum_grading_method THEN
        RAISE EXCEPTION 'grading_method is not External for submission_id: %', submission_id;
    END IF;

    -- ######################################################################
    -- Manual grading jobs MUST occur after external jobs have finished

    SELECT *
    INTO
        main.grading_jobs
    FROM
        grading_jobs AS gj
        JOIN submissions AS s ON (s.id = gj.submission_id)
        JOIN variants AS v ON (v.id = s.variant_id)
    WHERE
        v.id = main.variant_id
        AND gj.submission_id = s.id
        AND gj.graded_at IS NULL
        AND gj.grading_requested_at IS NOT NULL
        AND gj.grading_request_canceled_at IS NULL
        AND gj.grading_method = 'External'::enum_grading_method;

    IF FOUND THEN RAISE EXCEPTION 'manual grading cannot occur with % incomplete external grading jobs', COUNT(main.grading_jobs); END IF;

    -- ######################################################################
    -- insert the new grading job

    INSERT INTO grading_jobs AS gj
        (submission_id,  score, feedback, auth_user_id, grading_method, grading_requested_at)
    VALUES
        (arg_submission_id, arg_manual_grade_score, arg_manual_grade_feedback, arg_authn_user_id, 'Manual'::enum_grading_method, now())
    RETURNING gj.*
    INTO grading_job;

    -- ######################################################################
    -- update the submission

    UPDATE submissions AS s
    SET
        graded_at = now(),
        score = arg_manual_grade_score,
        feedback = arg_manual_grade_feedback,
        grading_method = 'Manual'::enum_grading_method
    WHERE
        s.id = arg_submission_id;

    -- ######################################################################
    -- update all parent objects

    IF assessment_instance_id IS NOT NULL THEN
        PERFORM instance_questions_manually_grade(instance_question_id, grading_job.score);
        PERFORM assessment_instances_grade(assessment_instance_id, arg_authn_user_id, credit, FALSE, TRUE);
    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
