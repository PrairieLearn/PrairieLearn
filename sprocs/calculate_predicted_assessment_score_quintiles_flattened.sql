CREATE OR REPLACE FUNCTION calculate_predicted_assessment_score_quintiles_flattened(
    assessment_question_ids BIGINT[]
) RETURNS TABLE (quintile INTEGER, predicted_score DOUBLE PRECISION)
AS $$
BEGIN
    RETURN QUERY SELECT
        predicted_assessment_score_quintiles_flattened.quintile::INTEGER,
        predicted_assessment_score_quintiles_flattened.predicted_assessment_score_quintiles AS predicted_score
    FROM
        unnest(calculate_predicted_assessment_score_quintiles(assessment_question_ids)) WITH ORDINALITY
            AS predicted_assessment_score_quintiles_flattened(predicted_assessment_score_quintiles, quintile);
END;
$$ LANGUAGE plpgsql;
