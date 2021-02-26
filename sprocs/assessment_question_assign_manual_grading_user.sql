DROP FUNCTION IF EXISTS assessment_question_assign_manual_grading_user(bigint, bigint, bigint);

-- Adds respective user to instance question in arg, removes user from any stale/abandoned manual grading fields

CREATE OR REPLACE FUNCTION
    assessment_question_assign_manual_grading_user(
        IN arg_assessment_question_id bigint,
        IN arg_instance_question_id bigint,
        IN arg_user_id bigint,
        OUT instance_question jsonb
    )
AS $$
BEGIN

    -- Mark instance question as being graded by user
    UPDATE instance_questions
    SET manual_grading_user = arg_user_id
    WHERE id = arg_instance_question_id;

    -- Reset manual_grading_user field for any abandoned/ungraded iqs for current user
    WITH ungraded_instance_questions AS (
        SELECT DISTINCT ON (iq.id) iq.id, s.graded_at
        FROM instance_questions AS iq
            JOIN variants AS v ON (v.instance_question_id = iq.id)
            JOIN submissions AS s ON (s.variant_id = v.id)
        WHERE
            iq.assessment_question_id = arg_assessment_question_id
            AND iq.manual_grading_user = arg_user_id
            AND iq.id != arg_instance_question_id
        ORDER BY iq.id ASC, s.date DESC, s.id DESC
    )
    UPDATE instance_questions AS iq
    SET manual_grading_user = NULL
    FROM ungraded_instance_questions
    WHERE
        iq.id = ungraded_instance_questions.id
        AND ungraded_instance_questions.graded_at IS NULL;

END;
$$ LANGUAGE plpgsql VOLATILE;


