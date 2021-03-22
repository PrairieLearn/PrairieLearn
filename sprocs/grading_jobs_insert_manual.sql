DROP FUNCTION IF EXISTS grading_jobs_insert_manual(bigint, bigint, double precision, jsonb);

CREATE OR REPLACE FUNCTION
    grading_jobs_insert_manual (
        IN submission_id bigint,
        IN authn_user_id bigint,
        IN manual_grade_score double precision, -- decimal percent divisble by 5
        IN manual_grade_feedback jsonb,
        OUT grading_job grading_jobs
    )
AS $$
<<main>>
DECLARE
    credit integer;
    variant_id bigint;
    instance_question_id bigint;
    assessment_instance_id bigint;
    grading_job grading_jobs%rowtype;
    grading_method enum_grading_method;
BEGIN

    -- What do we have to do? 
    -- We have to 1) update the submission score and feedback (but we may consider just updating this info
    -- in a new grading_job later)

    -- 2) Update the given score for the instance question (make sure the score can go lower)
    --   a. Consider an internal grading, external grading,a nd manual grading score. #
    --   if those three values existed, perhaps only the manual grade score should go lower.
    --   why is the score going lower? It is possible for dual score conflicts to sometimes take the lower
    --   of the two scores.
    -- 3) Update the given score for the assessment.

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
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;
    IF grading_method != 'ManualBeta'::enum_grading_method THEN
        RAISE EXCEPTION 'This logic is intended only for Manual Beta grading: %', submission_id;
    END IF;

    -- ######################################################################
    -- Do we need to cancel all grading jobs so manual grade is NOT overwritten?

    -- FOR grading_job IN
    --     UPDATE grading_jobs AS gj
    --     SET
    --         grading_request_canceled_at = now(),
    --         grading_request_canceled_by = grading_jobs_insert_external_manual.authn_user_id
    --     FROM
    --         variants AS v
    --         JOIN submissions AS s ON (s.variant_id = v.id)
    --     WHERE
    --         v.id = main.variant_id
    --         AND gj.submission_id = s.id
    --         AND gj.graded_at IS NULL
    --         AND gj.grading_requested_at IS NOT NULL
    --         AND gj.grading_request_canceled_at IS NULL
    --     RETURNING gj.*
    -- LOOP
    --     UPDATE submissions AS s
    --     SET grading_requested_at = NULL
    --     WHERE s.id = grading_job.submission_id;
    -- END LOOP;

    -- ######################################################################
    -- insert the new grading job

    INSERT INTO grading_jobs AS gj
        (submission_id,  score, feedback, auth_user_id, grading_method, grading_requested_at)
    VALUES
        (submission_id, manual_grade_score, manual_grade_feedback, authn_user_id, 'ManualBeta'::enum_grading_method, now())
    RETURNING gj.*
    INTO grading_job;

    -- ######################################################################
    -- update the submission

    UPDATE submissions AS s
    SET
        graded_at = now(),
        score = manual_grade_score,
        feedback = manual_grade_feedback,
        grading_method = 'ManualBeta'::enum_grading_method
    WHERE
        s.id = submission_id;

    -- ######################################################################
    -- update all parent objects

    IF assessment_instance_id IS NOT NULL THEN
        -- PERFORM instance_questions_grade(instance_question_id, grading_job.score, grading_job.id, grading_job.auth_user_id);
        PERFORM instance_questions_manually_grade(instance_question_id, grading_job.score, grading_job.auth_user_id);
        PERFORM assessment_instances_grade(assessment_instance_id, authn_user_id, credit, FALSE, TRUE);
    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
