DROP FUNCTION IF EXISTS instance_questions_grade(bigint,boolean,bigint);
DROP FUNCTION IF EXISTS instance_questions_grade(bigint,double precision,bigint);
DROP FUNCTION IF EXISTS instance_questions_grade(bigint,double precision,bigint,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_grade(
        instance_question_id bigint,
        submission_score DOUBLE PRECISION,
        authn_user_id bigint,
        grading_job_id bigint DEFAULT NULL
    ) RETURNS VOID
AS $$
DECLARE
    new_values record;
    new_instance_question instance_questions%ROWTYPE;
BEGIN
    SELECT *
    INTO new_values
    FROM instance_questions_points(instance_question_id, submission_score);

    UPDATE instance_questions AS iq
    SET
        open = new_values.open,
        status = new_values.status,
        points = new_values.points,
        points_in_grading = 0,
        score_perc = new_values.score_perc,
        score_perc_in_grading = 0,
        highest_submission_score = new_values.highest_submission_score,
        current_value = new_values.current_value,
        points_list = new_values.points_list,
        variants_points_list = new_values.variants_points_list,
        number_attempts = iq.number_attempts + 1
    WHERE
        iq.id = instance_question_id;

    INSERT INTO question_score_logs
        (instance_question_id, auth_user_id,  max_points,
                   points,            score_perc, grading_job_id)
    VALUES
        (instance_question_id, authn_user_id, new_values.max_points,
        new_values.points, new_values.score_perc, grading_job_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
