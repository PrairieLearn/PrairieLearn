DROP FUNCTION IF EXISTS instance_questions_select_lock_next_submission_for_manual_grading(bigint, bigint, bigint);

-- Use an assessment question ID to get list of instance questions.
-- LOCK and UPDATE last submission for each instance question.

CREATE OR REPLACE FUNCTION
    instance_questions_select_lock_next_submission_for_manual_grading(
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
    SELECT * FROM submissions
    WHERE (auth_user_id, date) IN (
        -- If we can group by ID here somehow, we can do a more precise query and perhaps
        -- also support teamwork manual grading one day.
        SELECT s.auth_user_id, MAX(s.date)
        FROM
            submissions AS s
            JOIN variants AS v ON (s.variant_id = v.id)
            JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            JOIN assessments AS a ON (a.id = aq.assessment_id)
        WHERE 
            iq.assessment_question_id = 67
            AND a.id = 6
            AND s.manual_grading_user IS NULL
            AND s.graded_at IS NULL
        GROUP BY s.auth_user_id
        LIMIT 1
    ) AND graded_at IS NULL
    FOR UPDATE;

    UPDATE submissions
    SET manual_grading_user = user_id
    RETURNING id INTO submission_id;

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

