CREATE OR REPLACE FUNCTION
    calculate_predicted_scores_for_randomly_generated_assessments(
    assessment_id_var BIGINT
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        SELECT
            array_agg(calculate_predicted_score_for_randomly_generated_assessment(assessment_id_var))
        FROM
            generate_series(1, 1000)
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
