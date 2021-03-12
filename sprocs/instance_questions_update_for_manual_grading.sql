DROP FUNCTION IF EXISTS instance_questions_update_for_manual_grading(bigint, bigint, bigint);

-- RETURN next instance question for grading from assessment question ID

CREATE OR REPLACE FUNCTION
    instance_questions_update_for_manual_grading(
        IN arg_assessment_id bigint, -- endpoint auth redundancy
        IN arg_assessment_question_id bigint,
        IN arg_user_id bigint,
        OUT instance_question jsonb
    )
AS $$
DECLARE
    iq_id bigint;
BEGIN

    -- Get LAST submission that is ungraded including manual grading conflicts
    WITH iq_with_last_submission AS (
        SELECT DISTINCT ON (iq.id) iq.*, s.graded_at
        FROM
            instance_questions AS iq
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN assessments AS a ON (a.id = aq.assessment_id)
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND a.id = arg_assessment_id
        ORDER BY iq.id ASC, s.date DESC, s.id DESC
    )
    SELECT iqwls.id
    INTO iq_id
    FROM
        iq_with_last_submission AS iqwls
    WHERE
        iqwls.graded_at IS NULL OR iqwls.manual_grading_conflict = TRUE
    ORDER BY RANDOM()
    LIMIT 1
    FOR UPDATE;

    PERFORM assessment_question_assign_manual_grading_user(arg_assessment_question_id, iq_id, arg_user_id);

    SELECT to_jsonb(iq.*)
    INTO instance_question
    FROM
        instance_questions AS iq
    WHERE id = iq_id;

END;
$$ LANGUAGE plpgsql VOLATILE;

