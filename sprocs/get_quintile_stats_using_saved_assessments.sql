DROP FUNCTION IF EXISTS get_quintile_stats_using_saved_assessments(BIGINT);
CREATE FUNCTION get_quintile_stats_using_saved_assessments(
    assessment_id_var BIGINT
) RETURNS TABLE(mean DOUBLE PRECISION, sd DOUBLE PRECISION, quintile INTEGER)
LANGUAGE PLPGSQL
AS $$
BEGIN
    RETURN QUERY
        WITH predicted_score_quintiles AS (
            SELECT
                calculate_predicted_score_quintiles(ga.generated_aq_ids, get_domain(assessment_id_var)) AS predicted_score_quintiles
            FROM
                generated_assessments AS ga
            WHERE
                ga.assessment_id = assessment_id_var
        ),
        quintile_stats_object AS (
            SELECT
                array_avg(predicted_score_quintiles.predicted_score_quintiles) AS quintile_means,
                array_sqrt(array_var(predicted_score_quintiles.predicted_score_quintiles)) AS quintile_sds
            FROM
                predicted_score_quintiles
        ),
        quintile_stats AS (
            SELECT
                quintile_stats_object.quintile_means[quintiles.quintile] AS quintile_mean,
                quintile_stats_object.quintile_sds[quintiles.quintile] AS quintile_sd,
                quintiles.quintile
            FROM
                quintile_stats_object
                CROSS JOIN generate_series(1, 5) AS quintiles (quintile)
        )
        SELECT * FROM quintile_stats;
END;
$$;
