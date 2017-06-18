CREATE OR REPLACE FUNCTION
    calculate_predicted_question_score_with_variance(
        assessment_question_id BIGINT
    ) RETURNS DOUBLE PRECISION
AS $$
BEGIN
    RETURN normal_rand(1,
        -- mean
        calculate_predicted_question_score(assessment_question_id),
        -- SD
        calculate_predicted_question_score_sd(assessment_question_id)
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
