CREATE FUNCTION
    variants_select_submission_for_grading (
        IN variant_id bigint,
        IN check_submission_id bigint DEFAULT NULL
    ) RETURNS TABLE (submission submissions)
AS $$
DECLARE
    instance_question_id BIGINT;
    grading_method enum_grading_method;
    max_auto_points DOUBLE PRECISION;
    max_manual_points DOUBLE PRECISION;
BEGIN
    PERFORM variants_lock(variant_id);

    SELECT v.instance_question_id, q.grading_method, aq.max_auto_points, aq.max_manual_points
    INTO instance_question_id, grading_method, max_auto_points, max_manual_points
    FROM
        variants AS v
        JOIN questions AS q ON (q.id = v.question_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        v.id = variant_id;

    IF NOT FOUND THEN RETURN; END IF; -- no variant and no question

    -- This sproc only selects variants for auto grading, so ignore if
    -- this is manual-only. The grading button would typically not be
    -- shown to students in this case, so this is an extra
    -- verification step to ensure students don't manually post a
    -- `grade` action.
    IF instance_question_id IS NULL THEN
        IF grading_method = 'Manual' THEN RETURN; END IF;
    ELSE
        IF max_auto_points = 0 AND max_manual_points != 0 THEN RETURN; END IF;
    END IF;

    -- start with the most recent submission
    SELECT s.*
    INTO submission
    FROM submissions AS s
    WHERE s.variant_id = variants_select_submission_for_grading.variant_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    IF NOT FOUND THEN RETURN; END IF; -- no submissions

    IF check_submission_id IS NOT NULL and check_submission_id != submission.id THEN
        RAISE EXCEPTION 'check_submission_id mismatch: % vs %', check_submission_id, submission.id USING ERRCODE = 'ST400';
    END IF;

    -- mark submission as regradable
    UPDATE submissions AS s
    SET regradable = TRUE
    WHERE s.id = submission.id;

    -- does the most recent submission actually need grading?
    IF submission.score IS NOT NULL THEN RETURN; END IF; -- already graded
    IF submission.grading_requested_at IS NOT NULL THEN RETURN; END IF; -- grading is in progress
    IF submission.broken THEN RETURN; END IF;
    IF NOT submission.gradable THEN RETURN; END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE;
