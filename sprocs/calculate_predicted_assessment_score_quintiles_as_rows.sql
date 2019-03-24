CREATE OR REPLACE FUNCTION calculate_predicted_assessment_score_quintiles_as_rows(
    assessment_question_ids BIGINT[]
) RETURNS TABLE (quintile INTEGER, predicted_score DOUBLE PRECISION)
AS $$
BEGIN
    RETURN (
        SELECT
            predicted_assessment_score_quintiles_flattened.predicted_assessment_score_quintiles,
            predicted_assessment_score_quintiles_flattened.quintile
        FROM
            unnest(calculate_predicted_assessment_score_quintiles(assessment_question_ids)) WITH ORDINALITY
                AS predicted_assessment_score_quintiles_flattened(predicted_assessment_score_quintiles, quintile)
    );
END;
$$ LANGUAGE plpgsql;
