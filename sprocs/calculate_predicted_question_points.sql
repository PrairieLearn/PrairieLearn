CREATE OR REPLACE FUNCTION calculate_predicted_question_points (
    qs_incremental_submission_score_array_averages DOUBLE PRECISION[],
    hw_qs_average_last_submission_score DOUBLE PRECISION,
    points_list DOUBLE PRECISION[],
    max_points DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN
        calculate_predicted_question_score(
            qs_incremental_submission_score_array_averages,
            hw_qs_average_last_submission_score,
            points_list,
            max_points) *
            max_points;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_predicted_question_points (
    assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION AS $$
BEGIN
    RETURN (
        SELECT
            calculate_predicted_question_score(assessment_question_id) * aq.max_points
        FROM
            assessment_questions AS aq
        WHERE
            aq.id = assessment_question_id
    );
END
$$ LANGUAGE plpgsql;
