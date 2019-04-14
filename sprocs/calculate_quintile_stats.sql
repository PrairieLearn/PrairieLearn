CREATE OR REPLACE FUNCTION calculate_quintile_stats(
    generated_assessment_question_ids BIGINT[][]) RETURNS SETOF RECORD
AS $$
BEGIN
    RETURN QUERY WITH predicted_quintile_scores AS (
        SELECT
            slice((calculate_predicted_assessment_score_quintiles_multiple_assessments(generated_assessment_question_ids)), quintiles.quintile) AS predicted_quintile_scores,
            quintiles.quintile
        FROM
            generate_series(1,5) AS quintiles (quintile)
    ),
    predicted_quintile_scores_flattened AS (
        SELECT
            predicted_quintile_scores.quintile,
            unnest(predicted_quintile_scores.predicted_quintile_scores) AS predicted_quintile_score
        FROM
            predicted_quintile_scores
    ),
    quintile_stats AS (
        SELECT
            predicted_quintile_scores_flattened.quintile,
            avg(predicted_quintile_scores_flattened.predicted_quintile_score) AS mean,
            stddev_pop(predicted_quintile_scores_flattened.predicted_quintile_score) AS sd
        FROM
            predicted_quintile_scores_flattened
        GROUP BY
            predicted_quintile_scores_flattened.quintile
        ORDER BY
            predicted_quintile_scores_flattened.quintile
    ) SELECT * FROM quintile_stats;
END;
$$ LANGUAGE plpgsql VOLATILE;
