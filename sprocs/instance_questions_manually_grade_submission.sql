-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_questions_manually_grade_submission(bigint, bigint, double precision, text, jsonb);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade_submission(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_score double precision,
        IN arg_modified_at text,
        IN arg_manual_note jsonb,
        OUT instance_question jsonb,
        OUT submission jsonb,
        OUT grading_user jsonb,
        OUT variant jsonb,
        OUT grading_job grading_jobs,
        OUT instance_question_modified boolean
    )
AS $$
DECLARE
    iq_temp instance_questions%rowtype;
    s_temp submissions%rowtype;
BEGIN

    SELECT iq.*
    INTO iq_temp
    FROM
        instance_questions AS iq
    WHERE iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF arg_modified_at::timestamp < iq_temp.modified_at THEN
        instance_question_modified = TRUE;

        SELECT to_jsonb(iq.*), to_jsonb(s.*), to_jsonb(u.*), to_jsonb(v.*)
        INTO instance_question, submission, grading_user, variant
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

        RETURN;
    END IF;

    -- Grade if instance question has NOT been modified since grading user loaded page
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
    PERFORM grading_jobs_insert_internal(s_temp.id, arg_user_id, s_temp.gradable, s_temp.broken, s_temp.format_errors, 
        s_temp.partial_scores, arg_score, s_temp.v2_score, arg_manual_note, s_temp.submitted_answer, s_temp.params, s_temp.true_answer);

END;
$$ LANGUAGE plpgsql VOLATILE;
