-- BLOCK instance_questions_manually_grade_submission
DROP FUNCTION IF EXISTS instance_questions_manually_grade_submission(bigint, bigint, double precision, text, jsonb);

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade_submission(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_score double precision,
        IN arg_modified_at text,
        IN arg_manual_note jsonb,
        OUT instance_question jsonb
    )
AS $$
DECLARE
    iq_temp instance_questions%rowtype;
    s_temp submissions%rowtype;
    is_conflict boolean;
BEGIN

    SELECT iq.*
    INTO iq_temp
    FROM
        instance_questions AS iq
    WHERE
        iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF iq_temp.modified_at > arg_modified_at::timestamp THEN
        is_conflict = TRUE;
    END IF;

    -- Create grading job even if a grading job spin-lock conflict will exist
    SELECT s.*
    INTO s_temp
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

    PERFORM assessment_question_assign_manual_grading_user(iq_temp.assessment_question_id, iq_temp.id, arg_user_id);
    PERFORM grading_jobs_insert_manual(s_temp.id, arg_user_id, arg_score, arg_manual_note);

    -- Mark instance question to resolve conflict in GET of instructorQuestionManualGrading.js
    UPDATE instance_questions AS iq
    SET
        manual_grading_conflict = is_conflict
    WHERE
        id = arg_instance_question_id
    RETURNING to_json(iq.*)
    INTO instance_question;

END;
$$ LANGUAGE plpgsql VOLATILE;
