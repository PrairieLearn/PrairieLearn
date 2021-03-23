DROP FUNCTION IF EXISTS grading_jobs_insert_internal(bigint,bigint,boolean,boolean,jsonb,jsonb,double precision,jsonb,jsonb,jsonb,jsonb);

DROP FUNCTION IF EXISTS grading_jobs_insert_internal(bigint,bigint,boolean,jsonb,jsonb,double precision,jsonb,jsonb,jsonb,jsonb);

CREATE OR REPLACE FUNCTION
    grading_jobs_insert_internal (
        IN submission_id bigint,
        IN authn_user_id bigint,
        IN new_gradable boolean,
        IN new_broken boolean,
        IN new_format_errors jsonb,
        IN new_partial_scores jsonb,
        IN new_score double precision,
        IN new_v2_score double precision,
        IN new_feedback jsonb,
        IN new_submitted_answer jsonb,
        IN new_params jsonb,
        IN new_true_answer jsonb,
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
    new_correct boolean;
BEGIN
    -- ######################################################################
    -- get the related objects

    -- we must have a variant, but we might not have an assessment_instance
    SELECT s.credit,       v.id, q.grading_method,              iq.id,                  ai.id
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
    -- update the submission

    IF new_gradable = FALSE THEN
        new_score := null;
        new_partial_scores := null;
        new_correct := null;
    ELSE
        new_correct := (new_score >= 1.0);
    END IF;

    UPDATE submissions AS s
    SET
        graded_at = now(),
        gradable = new_gradable,
        broken = new_broken,
        format_errors = new_format_errors,
        partial_scores = new_partial_scores,
        score = new_score,
        v2_score = new_v2_score,
        correct = new_correct,
        feedback = new_feedback,
        submitted_answer = new_submitted_answer,
        grading_method = main.grading_method
    WHERE
        s.id = submission_id;

    -- ######################################################################
    -- update the variant

    UPDATE variants AS v
    SET
        params = new_params,
        true_answer = new_true_answer
    WHERE v.id = variant_id;

    -- ######################################################################
    -- insert the grading job

    INSERT INTO grading_jobs AS gj
        (submission_id,     score,     v2_score, correct,     feedback,
            partial_scores, auth_user_id,  grading_method, gradable)
    VALUES
        (submission_id, new_score, new_v2_score, new_correct, new_feedback,
        new_partial_scores, authn_user_id, grading_method, new_gradable)
    RETURNING gj.*
    INTO grading_job;

    IF new_gradable = FALSE THEN
        -- ######################################################################
        -- If the submission is ungradable then we shouldn't update grades
        -- and use up an attempt

        IF assessment_instance_id IS NOT NULL THEN
            UPDATE instance_questions
            SET status = 'invalid'::enum_instance_question_status
            WHERE id = instance_question_id;
        END IF;
    ELSE
        -- ######################################################################
        -- update all parent objects

        PERFORM variants_update_after_grading(variant_id, grading_job.correct);
        IF assessment_instance_id IS NOT NULL THEN
           PERFORM instance_questions_grade(instance_question_id, grading_job.score, grading_job.id, grading_job.auth_user_id);
           PERFORM assessment_instances_grade(assessment_instance_id, grading_job.auth_user_id, credit);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
