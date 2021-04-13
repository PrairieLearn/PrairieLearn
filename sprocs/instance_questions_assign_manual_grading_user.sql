DROP FUNCTION IF EXISTS instance_questions_assign_manual_grading_user(bigint, bigint, bigint);

-- Adds user id to instance question, removes id from any stale/abandoned manual grading fields
CREATE OR REPLACE FUNCTION
    instance_questions_assign_manual_grading_user(
        IN arg_assessment_question_id bigint,
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        OUT instance_question jsonb
    )
AS $$
BEGIN

    INSERT INTO users_manual_grading (user_id, instance_question_id, date_started)
    VALUES (arg_user_id, arg_instance_question_id, NOW())
    ON CONFLICT (user_id)
    DO
        UPDATE SET instance_question_id = arg_instance_question_id, date_started = NOW();

    -- -- Add user id to instance question when not already being grading
    -- UPDATE instance_questions
    -- SET manual_grading_user = arg_user_id
    -- WHERE
    --     id = arg_instance_question_id
    --     AND manual_grading_user IS NULL;

    -- -- Remove current user id on other assumed abandoned & ungraded iqs
    -- WITH iqs_with_last_submission AS (
    --     SELECT DISTINCT ON (iq.id) iq.*, s.graded_at
    --     FROM instance_questions AS iq
    --         JOIN variants AS v ON (v.instance_question_id = iq.id)
    --         JOIN submissions AS s ON (s.variant_id = v.id)
    --     WHERE
    --         iq.assessment_question_id = arg_assessment_question_id
    --     ORDER BY iq.id ASC, s.date DESC, s.id DESC
    -- )
    -- UPDATE instance_questions AS iq
    -- SET manual_grading_user = NULL
    -- FROM iqs_with_last_submission AS iqwls
    -- WHERE
    --     iq.manual_grading_user = arg_user_id
    --     AND iq.id != arg_instance_question_id
    --     AND iqwls.id = iq.id
    --     AND iqwls.graded_at IS NULL;

END;
$$ LANGUAGE plpgsql VOLATILE;

