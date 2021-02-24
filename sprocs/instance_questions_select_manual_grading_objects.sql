-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb,
        OUT grading_user jsonb,
        OUT assessment_question jsonb
    )
AS $$
DECLARE
    temp submissions%rowtype;
BEGIN

    SELECT s.*
    INTO temp
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'no submission found for instance question: %', arg_instance_question_id; END IF;

    IF temp.manual_grading_user IS NULL THEN
        UPDATE submissions
        SET manual_grading_user = arg_user_id
        WHERE id = temp.id;
    END IF;

    SELECT to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), to_jsonb(u.*), to_jsonb(aq.*)
    INTO question, variant, submission, grading_user, assessment_question
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id)
        JOIN users AS u ON (u.user_id = s.manual_grading_user)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
