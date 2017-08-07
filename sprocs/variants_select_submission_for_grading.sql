CREATE OR REPLACE FUNCTION
    variants_select_submission_for_grading (
        variant_id bigint,
        check_submission_id boolean DEFAULT NULL
    ) RETURNS submissions%rowtype
AS $$
DECLARE
    submission submissions%rowtype;
BEGIN
    -- start with the most recent submission
    SELECT s.*
    INTO submission
    FROM
        variants AS v
        JOIN submissions AS s ON (s.variant_id = v.id)
    ORDER BY s.date DESC
    LIMIT 1;

    IF NOT FOUND THEN RETURN; END IF; -- no submissions

    IF check_submission_id IS NOT NULL and check_submission_id != submission.id THEN
        RAISE EXCEPTION 'check_submission_id mismatch: % vs %', check_submission_id, submission.id;
    END IF;

    -- does the most recent submission actually need grading?
    IF submission.score IS NOT NULL THEN RETURN NULL; END IF; -- already graded
    IF submission.grading_requested_at IS NOT NULL THEN RETURN NULL; END IF; -- grading is in progress
    IF NOT submission.gradable THEN RETURN NULL; END IF;

    RETURN submission;
END;
$$ LANGUAGE plpgsql VOLATILE;
