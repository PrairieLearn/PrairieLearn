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

    INSERT INTO users_manual_grading(user_id, instance_question_id, date_started)
    VALUES(arg_user_id, arg_instance_question_id, NOW())
    ON CONFLICT (user_id, instance_question_id)
    DO
        UPDATE SET date_last_accessed = NOW();

END;
$$ LANGUAGE plpgsql VOLATILE;

