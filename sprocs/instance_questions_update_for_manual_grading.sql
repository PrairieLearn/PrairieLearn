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

    -- Get LAST submissions, filter for ungraded, then return instance question
    SELECT iq.id
        FROM instance_questions AS iq
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
    INTO iq_id
    WHERE (s.auth_user_id, s.date) 
        IN (
            SELECT s.auth_user_id, MAX(s.date)
            FROM
                submissions AS s
                JOIN variants AS v ON (s.variant_id = v.id)
                JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
                JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
                JOIN assessments AS a ON (a.id = aq.assessment_id)
            WHERE
                iq.assessment_question_id = arg_assessment_question_id
                AND a.id = arg_assessment_id
            GROUP BY s.auth_user_id
        )
        AND s.graded_at IS NULL
    ORDER BY RANDOM()
    LIMIT 1
    FOR UPDATE;

    -- Mark instance question as being graded by user
    UPDATE instance_questions
    SET manual_grading_user = arg_user_id
    WHERE id = iq_id;

    SELECT to_jsonb(iq.*)
    INTO instance_question
    FROM
        instance_questions AS iq
    WHERE id = iq_id;

    -- Reset manual_grading_user field for any abandoned/ungraded iqs for current user
    WITH ungraded_instance_questions AS (
        SELECT DISTINCT ON (iq.id) iq.id
        FROM instance_questions AS iq
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND iq.manual_grading_user = arg_user_id
            AND iq.id != iq_id
            AND s.graded_at IS NULL
        ORDER BY iq.id ASC, s.date DESC, s.id DESC
    )
    UPDATE instance_questions AS iq
    SET manual_grading_user = NULL
    FROM ungraded_instance_questions
    WHERE iq.id = ungraded_instance_questions.id;

END;
$$ LANGUAGE plpgsql VOLATILE;

