CREATE OR REPLACE FUNCTION
    get_randomly_generated_assessment_question_ids_and_calculate_predicted_score_quintiles(
        IN assessment_id_var BIGINT,
        OUT result DOUBLE PRECISION[],
        OUT generated_assessment_question_ids BIGINT[]
    )
AS $$
BEGIN
    generated_assessment_question_ids = get_randomly_generated_assessment_question_ids(assessment_id_var);
    result = calculate_predicted_score_quintiles(generated_assessment_question_ids, get_domain(assessment_id_var));
END;
$$ LANGUAGE plpgsql VOLATILE;
