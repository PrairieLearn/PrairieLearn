-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN iq_id bigint,
        IN user_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb,
        OUT _user jsonb
    )
AS $$
BEGIN

    SELECT s.*
    INTO submission
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = iq_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF submission IS NOT NULL AND submission->>'manual_grading_user' IS NOT NULL THEN
        UPDATE submissions
        SET manual_grading_user = user_id
        WHERE id = (SELECT id FROM submission);
    END IF;

    SELECT to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), to_jsonb(u.*)
    INTO question, variant, submission, _user
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id)
        FULL JOIN users as u ON (s.manual_grading_user = u.user_id)
    WHERE iq.id = iq_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
