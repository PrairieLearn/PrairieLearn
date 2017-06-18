CREATE OR REPLACE FUNCTION
    calculate_predicted_score_for_randomly_generated_assessment(
        assessment_id_var BIGINT
    ) RETURNS DOUBLE PRECISION
AS $$
BEGIN
    RETURN calculate_predicted_assessment_score(get_randomly_generated_assessment_question_ids(assessment_id_var));
END;
$$ LANGUAGE plpgsql VOLATILE;
