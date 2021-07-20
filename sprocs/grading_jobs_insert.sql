CREATE FUNCTION
    grading_jobs_insert (
        IN submission_id bigint,
        IN authn_user_id bigint,
        IN new_gradable boolean DEFAULT NULL,
        IN new_broken boolean DEFAULT NULL,
        IN new_format_errors jsonb DEFAULT NULL,
        IN new_partial_scores jsonb DEFAULT NULL,
        IN new_score double precision DEFAULT NULL,
        IN new_v2_score double precision DEFAULT NULL,
        IN new_feedback jsonb DEFAULT NULL,
        IN new_submitted_answer jsonb DEFAULT NULL,
        IN new_params jsonb DEFAULT NULL,
        IN new_true_answer jsonb DEFAULT NULL,
        OUT grading_job grading_jobs
    )
AS $$
DECLARE
    grading_method enum_grading_method;
BEGIN
    PERFORM submissions_lock(submission_id);

    -- ######################################################################
    -- get the grading method

    SELECT q.grading_method
    INTO     grading_method
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;

    -- ######################################################################
    -- delegate the call

    IF grading_method = 'Internal' THEN
        grading_job := grading_jobs_insert_internal(submission_id, authn_user_id,
                            new_gradable, new_broken, new_format_errors, new_partial_scores,
                            new_score, new_v2_score, new_feedback, new_submitted_answer,
                            new_params, new_true_answer);
    ELSIF grading_method = 'External' OR grading_method = 'Manual' THEN
        grading_job := grading_jobs_insert_external_manual(submission_id, authn_user_id);
    ELSE
        RAISE EXCEPTION 'unknown grading_method: %', grading_method;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
