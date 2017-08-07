CREATE OR REPLACE FUNCTION
    grading_jobs_insert_internal (
        IN submission_id bigint,
        IN authn_user_id bigint,
        IN new_gradable boolean,
        IN new_errors jsonb,
        IN new_partial_scores jsonb,
        IN new_score double precision,
        IN new_feedback jsonb,
        IN new_submitted_answer jsonb,
        IN new_params jsonb,
        IN new_true_answer jsonb,
        OUT grading_job grading_jobs
    )
AS $$
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
    INTO     credit, variant_id, grading_method, instance_question_id, assessment_instance_id
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;
    IF grading_method != 'Internal' THEN
        RAISE EXCEPTION 'grading_method is not Internal for submisison_id: %', submission_id;
    END IF;

    -- ######################################################################
    -- update the submission

    new_correct = (new_score >= 0.5);

    UPDATE submissions AS s
    SET
        graded_at = now(),
        gradable = new_gradable,
        errors = new_errors,
        partial_scores = new_partial_scores,
        score = new_score,
        correct = (new_score >= 0.5),
        feedback = new_feedback,
        submitted_answer = new_submitted_answer,
        grading_method = grading_method
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
        (submission_id,     score,     correct,     feedback,
            partial_scores, auth_user_id,  grading_method)
    VALUES
        (submissino_id, new_score, new_correct, new_feedback,
        new_partial_scores, authn_user_id, grading_method)
    RETURNING gj.*
    INTO grading_job;

    -- ######################################################################
    -- update all parent objects

    PERFORM variants_update_after_grading(variant_id);
    IF assessment_instance_id IS NOT NULL THEN
        PERFORM instance_questions_grade(instance_question_id, grading_job.correct, grading_job.auth_user_id);
        PERFORM assessment_instances_grade(assessment_instance_id, grading_job.auth_user_id, credit);
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
