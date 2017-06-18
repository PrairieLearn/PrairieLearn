CREATE OR REPLACE FUNCTION calculate_predicted_assessment_score_quintiles(
    assessment_question_ids BIGINT[]
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        WITH aq_ids AS (
            SELECT unnest(assessment_question_ids) AS assessment_question_id
        ),
        predicted_assessment_score_flattened AS (
            SELECT
                sum(predicted_question_points_quintiles.predicted_question_points) / sum(aq.max_points) AS score,
                predicted_question_points_quintiles.quintile
            FROM
                aq_ids
                JOIN assessment_questions AS aq ON (aq.id = aq_ids.assessment_question_id)
                JOIN unnest(calculate_predicted_question_points_quintiles(aq_ids.assessment_question_id))
                    WITH ORDINALITY AS predicted_question_points_quintiles(predicted_question_points, quintile) ON TRUE
            GROUP BY
                predicted_question_points_quintiles.quintile
            ORDER BY
                predicted_question_points_quintiles.quintile
        ),
        predicted_assessment_score AS (
            SELECT
                array_agg(predicted_assessment_score_flattened.score)
            FROM
                predicted_assessment_score_flattened
        )
        SELECT * FROM predicted_assessment_score
    );
END;
$$ LANGUAGE plpgsql;
