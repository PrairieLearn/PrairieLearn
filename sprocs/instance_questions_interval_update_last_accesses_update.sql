DROP FUNCTION IF EXISTS instance_questions_interval_update_last_accesses_update(bigint,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_interval_update_last_accesses_update(
        IN instance_questionId bigint,
        IN userId bigint
    )
RETURNS VOID
AS $$
DECLARE
    last_access_tmp last_accesses%rowtype;
BEGIN
    -- ######################################################################
    -- get the assessment

    SELECT last_accesses.* INTO last_access_tmp FROM last_accesses WHERE last_accesses.user_id = userId;

    -- ######################################################################
    -- determine the "number" of the new assessment instance
    IF FOUND THEN
        IF (current_timestamp - last_access_tmp.last_access) > interval '1 hour' THEN
            UPDATE last_accesses
            SET last_access = now(), instance_question_id = instance_questionId
            WHERE last_accesses.user_id = userId;
        ELSE
            BEGIN
                UPDATE instance_questions
                SET question_duration = instance_questions.question_duration + (current_timestamp - last_access_tmp.last_access)
                WHERE instance_questions.id = last_access_tmp.instance_question_id AND instance_questions.authn_user_id = userId;
                UPDATE last_accesses
                SET last_access = now(), instance_question_id = instance_questionId
                WHERE last_accesses.user_id = userId;
            END;
        END IF;
    ELSE
        INSERT INTO last_accesses (user_id, last_access, instance_question_id)
        VALUES (userId, current_timestamp, instance_questionId);
    END IF;

END;
$$ LANGUAGE plpgsql VOLATILE;
