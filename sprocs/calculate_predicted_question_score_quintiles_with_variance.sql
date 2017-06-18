CREATE OR REPLACE FUNCTION
    calculate_predicted_question_score_quintiles_with_variance(
        assessment_question_id BIGINT
) RETURNS DOUBLE PRECISION[]
AS $$
BEGIN
    RETURN (
        WITH predicted_question_score_quintiles AS (
            SELECT calculate_predicted_question_score_quintiles(assessment_question_id)
        ),
        predicted_question_score_quintiles_sd AS (
            SELECT calculate_predicted_question_score_quintiles_sd(assessment_question_id)
        )
        predicted_question_score_quintiles_with_variance_flattened AS (
            SELECT
                quintiles.quintile AS quintile,
                normal_rand(1,
                    -- mean
                    predicted_question_score_quintiles[quintile],
                    -- SD
                    predicted_question_score_quintiles_sd[quintile]
                 ) AS score_with_variance
            FROM
                generate_series(1, 5) AS quintiles (quintile)
                JOIN predicted_question_score_quintiles ON TRUE
                JOIN predicted_question_score_quintiles_sd ON TRUE
            WHERE
                aq.id = assessment_question_id
            ORDER BY
                quintiles.quintile
        )
        SELECT
            array_agg(predicted_question_score_quintiles.predicted_question_score)
        FROM
            predicted_question_score_quintiles
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
