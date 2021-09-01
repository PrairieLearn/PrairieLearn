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
        IN new_true_answer jsonb DEFAULT NULL
    )
RETURNS SETOF grading_jobs
AS $$
DECLARE
    grading_method_internal boolean;
    grading_method_external boolean;
    grading_method_manual boolean;
BEGIN
    PERFORM submissions_lock(submission_id);

    -- ######################################################################
    -- get the grading method

    SELECT q.grading_method_internal, q.grading_method_external, q.grading_method_manual
    INTO     grading_method_internal,   grading_method_external,   grading_method_manual
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN questions AS q ON (q.id = v.question_id)
    WHERE s.id = submission_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such submission_id: %', submission_id; END IF;

    -- ######################################################################
    -- build up all grading jobs
    IF grading_method_internal = False AND grading_method_external = False AND grading_method_manual = False THEN
        RAISE EXCEPTION 'all grading methods set to false: (internal %s, external %s, manual %s)', grading_method_internal, grading_method_external, grading_method_manual;
    END IF;

    IF grading_method_internal = False AND grading_method_external = False AND grading_method_manual = True THEN
        RAISE EXCEPTION 'Questions configured for ONLY manual grading cannot be automatically graded. Disable grade button.';
    END IF;
        
    -- delegate internal grading job ()
    IF grading_method_internal = True THEN
        RETURN NEXT grading_jobs_insert_internal(submission_id, authn_user_id,
                            new_gradable, new_broken, new_format_errors, new_partial_scores,
                            new_score, new_v2_score, new_feedback, new_submitted_answer,
                            new_params, new_true_answer);
    END IF;
    
    -- delegate external grading job
    IF grading_method_external = True THEN
        RETURN NEXT grading_jobs_insert_external(submission_id, authn_user_id, 'External');
    END IF;

    -- delegate should do nothing here; wait for manual grading action through endpoint
    IF grading_method_manual = True THEN
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;