DROP FUNCTION IF EXISTS variants_select_submission_for_grading(bigint,boolean);
DROP FUNCTION IF EXISTS variants_select_submission_for_grading(bigint,bigint);
DROP FUNCTION IF EXISTS variants_select_submission_for_grading(bigint,bigint,boolean);

CREATE OR REPLACE FUNCTION
    variants_select_submission_for_grading (
        IN variant_id bigint,
        IN check_submission_id bigint DEFAULT NULL,
        IN return_graded_submissions boolean DEFAULT FALSE
    ) RETURNS TABLE (submission submissions)
AS $$
BEGIN
    PERFORM variants_lock(variant_id);

    -- start with the most recent submission
    SELECT s.*
    INTO submission
    FROM submissions AS s
    WHERE s.variant_id = variants_select_submission_for_grading.variant_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    IF NOT FOUND THEN RETURN; END IF; -- no submissions

    IF check_submission_id IS NOT NULL and check_submission_id != submission.id THEN
        RAISE EXCEPTION 'check_submission_id mismatch: % vs %', check_submission_id, submission.id;
    END IF;

    IF return_graded_submissions IS NOT TRUE THEN
        -- returning the submission for now. We have to decide what to do in each case on the front-end, but returning object for now.
        -- I know we want graded objects and likely want to display gradsing in progress if it is occurring.
        IF submission.score IS NOT NULL THEN RETURN; END IF; -- already graded
        IF submission.grading_requested_at IS NOT NULL THEN RETURN; END IF; -- grading is in progress
        IF submission.broken THEN RETURN; END IF;
        IF NOT submission.gradable THEN RETURN; END IF;
    END IF;

    RETURN NEXT;

END;
$$ LANGUAGE plpgsql VOLATILE;
