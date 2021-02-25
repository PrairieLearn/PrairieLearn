DROP FUNCTION IF EXISTS instance_questions_update_for_manual_grading(bigint, bigint, bigint);

-- Use an assessment question ID to get an instance question.
-- LOCK, UPDATE instance question for manual grading, RETURN submission's instance question.

CREATE OR REPLACE FUNCTION
    instance_questions_update_for_manual_grading(
        IN a_id bigint, -- for endpoint auth
        IN aq_id bigint, -- for query
        IN user_id bigint, -- to mark submission as being graded by
        OUT instance_question jsonb
    )
AS $$
DECLARE
    instance_question_id bigint;
BEGIN

    -- Only LAST, aka. MAX(date), submission qualifies for Manual Grading
    SELECT iq.id
        FROM instance_questions AS iq
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
    INTO instance_question_id
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
                iq.assessment_question_id = aq_id
                AND a.id = a_id
            GROUP BY s.auth_user_id
        )
        AND s.graded_at IS NULL
    LIMIT 1
    FOR UPDATE;

    UPDATE instance_questions
    SET manual_grading_user = user_id
    WHERE id = instance_question_id;

    SELECT to_jsonb(iq.*)
    INTO instance_question
    FROM 
        instance_questions AS iq
    WHERE id = instance_question_id;

END;
$$ LANGUAGE plpgsql VOLATILE;

