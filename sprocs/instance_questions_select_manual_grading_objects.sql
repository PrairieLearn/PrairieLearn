-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN iq_id bigint,
        IN user_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb
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
    WHERE iq.id = 3
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;

    SELECT to_jsonb(q.*), to_jsonb(v.*)
    INTO question, variant
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = iq_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    UPDATE submissions
    SET manual_grading_user = user_id
    WHERE id = (SELECT id FROM submission)
    RETURNING * INTO submission;

END;
$$ LANGUAGE plpgsql VOLATILE;
