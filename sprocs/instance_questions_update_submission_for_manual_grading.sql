DROP FUNCTION IF EXISTS instance_questions_update_submission_for_manual_grading(bigint, bigint, bigint);

-- Use an assessment question ID to get an instance question.
-- LOCK, UPDATE last submission for manual grading, RETURN submission's instance question.

CREATE OR REPLACE FUNCTION
    instance_questions_update_submission_for_manual_grading(
        IN a_id bigint, -- for endpoint auth
        IN aq_id bigint, -- for query
        IN user_id bigint, -- to mark submission as being graded by
        OUT instance_question jsonb
    )
AS $$
DECLARE
    submission_id bigint;
BEGIN

    -- Only LAST, aka. MAX(date), submission qualifies for Manual Grading
    SELECT id FROM submissions
    INTO submission_id
    WHERE (auth_user_id, date) 
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
        AND graded_at IS NULL
    LIMIT 1
    FOR UPDATE;

    UPDATE submissions
    SET manual_grading_user = user_id
    WHERE id = submission_id;

    SELECT to_jsonb(iq.*)
    INTO instance_question
    FROM 
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN assessments AS a ON (a.id = aq.assessment_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE s.id = submission_id;

END;
$$ LANGUAGE plpgsql VOLATILE;

