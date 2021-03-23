CREATE OR REPLACE FUNCTION
    instance_questions_update_in_grading (
        instance_question_id bigint,
        authn_user_id bigint
    ) RETURNS VOID
AS $$
DECLARE
    new_values record;
    new_instance_question instance_questions%ROWTYPE;
BEGIN
    -- how many points could we get if the answer was fully correct?
    SELECT *
    INTO new_values
    FROM instance_questions_points(instance_question_id, 1);

    UPDATE instance_questions AS iq
    SET
        status = 'grading',
        points_in_grading = new_values.points,
        score_perc_in_grading = new_values.score_perc,
        modified_at = now()
    WHERE
        iq.id = instance_question_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
