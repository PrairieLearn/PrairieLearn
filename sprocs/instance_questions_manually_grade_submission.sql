-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_questions_select_manual_grading_objects(bigint, bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_questions_select_manual_grading_objects(
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        IN arg_score bigint,
        IN arg_modified_at date,
        IN arg_manual_note jsonb,
        OUT instance_question instance_questions%rowtype,
        OUT question questions%rowtype,
        OUT variant variants%rowtype,
        OUT submission submissions%rowtype,
        OUT grading_user user%row_type,
        OUT assessment_question assessment_questions%rowtype
    )
AS $$
DECLARE
    iq_temp instance_questions%rowtype;
BEGIN

    SELECT iq.*
    INTO iq_temp
    FROM
        instance_questions AS iq
    WHERE iq.id = arg_instance_question_id
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'instance question not found: %', arg_instance_question_id; END IF;

    IF arg_modified_at < iq_temp.modified_at THEN RAISE EXCEPTION 'instance question modified. Manual grading must update latest version.'; END IF;

    IF iq_temp.manual_grading_user IS NULL THEN
        UPDATE instance_questions
        SET manual_grading_user = arg_user_id
        WHERE id = iq_temp.id;
    END IF;

    SELECT iq.*, q.*, v.*, s.*, u.*, aq.*
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

    PERFORM assessment_question_assign_manual_grading_user(iq_temp.assessment_question_id, iq_temp.id, arg_user_id);
    PERFORM grading_jobs_insert_internal()

END;
$$ LANGUAGE plpgsql VOLATILE;
