-- BLOCK instance_questions_select_manual_grading_objects
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        OUT instance_question jsonb,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb,
        OUT grading_user jsonb,
        OUT assessment_question jsonb,
        OUT grading_job_conflict jsonb
    )
AS $$
DECLARE
    iq_temp instance_questions%rowtype;
BEGIN

    SELECT iq.*
    INTO iq_temp
    FROM
        instance_questions AS iq
    WHERE 
        iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF iq_temp.manual_grading_user IS NULL THEN
        UPDATE instance_questions
        SET manual_grading_user = arg_user_id
        WHERE id = iq_temp.id;
    END IF;
    
    -- gj conflict is two grading_jobs submitted for same submission by two manual grading users 
    IF iq_temp.manual_grading_conflict IS TRUE THEN
        SELECT json_agg(row_to_json(gj.*))
        INTO grading_job_conflict
        FROM
            grading_jobs AS gj
        WHERE
            gj.submission_id = (
                SELECT s.id
                FROM submissions AS s
                    JOIN variants AS v ON (v.id = s.variant_id)
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                WHERE iq.id = arg_instance_question_id
                ORDER BY s.date DESC, s.id DESC
                LIMIT 1
            )
            AND gj.grading_method = 'ManualBeta'::enum_grading_method
        LIMIT 2;
    END IF;

    PERFORM assessment_question_assign_manual_grading_user(iq_temp.assessment_question_id, iq_temp.id, arg_user_id);

    SELECT to_jsonb(iq.*), to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), to_jsonb(u.*), to_jsonb(aq.*)
    INTO instance_question, question, variant, submission, grading_user, assessment_question
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        JOIN submissions AS s ON (s.variant_id = v.id)
        JOIN users AS u ON (u.user_id = iq.manual_grading_user)
    WHERE iq.id = arg_instance_question_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
