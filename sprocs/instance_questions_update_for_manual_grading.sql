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

    -- Get LAST submissions, filter for ungraded entries to find next ungraded instance question
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

    PERFORM assessment_question_assign_manual_grading_user(arg_assessment_question_id, iq_id, arg_user_id);

    SELECT to_jsonb(iq.*)
    INTO instance_question
    FROM
        instance_questions AS iq
    WHERE id = iq_id;
END;
$$ LANGUAGE plpgsql VOLATILE;

