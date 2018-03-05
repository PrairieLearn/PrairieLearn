-- BLOCK generated_score_new
WITH generated_aq_ids AS (
    SELECT
        get_randomly_generated_assessment_question_ids_multiple_reps($assessment_id, 50) AS generated_assessment_question_ids
),
generated_aq_ids_flattened AS (
    SELECT
        slice(generated_aq_ids.generated_assessment_question_ids, rows.row) AS generated_assessment_question_ids
    FROM
        generated_aq_ids
        JOIN LATERAL generate_series(1, array_length(generated_aq_ids.generated_assessment_question_ids, 1)) AS rows (row) ON TRUE
),
quintile_stats_object AS (
    SELECT
        quintile_stats.*,
        quintile_stats.mean - $numSds * quintile_stats.sd AS lower_bound,
        quintile_stats.mean + $numSds * quintile_stats.sd AS upper_bound
    FROM
        generated_aq_ids
        JOIN calculate_quintile_stats(get_domain($assessment_id), generated_aq_ids.generated_assessment_question_ids) quintile_stats (quintile INTEGER, mean DOUBLE PRECISION, sd DOUBLE PRECISION) ON TRUE
    ORDER BY
        quintile_stats.quintile
),
quintile_stats AS (
    SELECT
        array_agg(quintile_stats_object.mean) AS means,
        array_agg(quintile_stats_object.sd) AS sds,
        array_agg(quintile_stats_object.lower_bound) AS lower_bounds,
        array_agg(quintile_stats_object.upper_bound) AS upper_bounds
    FROM
        quintile_stats_object
),
useful_data AS (
    SELECT
        generated_aq_ids_flattened.generated_assessment_question_ids
            AS generated_assessment_question_ids,
        filter_generated_assessment(
            generated_aq_ids_flattened.generated_assessment_question_ids,
            quintile_stats.means,
            quintile_stats.sds,
            get_domain($assessment_id),
            $numSds
        ) AS keep,
        calculate_predicted_score_quintiles(
            generated_aq_ids_flattened.generated_assessment_question_ids,
            get_domain($assessment_id)
        ) AS predicted_quintile_scores
    FROM
        generated_aq_ids_flattened
        JOIN quintile_stats ON TRUE
),
quintile_result AS (
    SELECT
        quintiles.quintile AS quintile,
        keep.keep,
        histogram(useful_data.predicted_quintile_scores[quintiles.quintile], 0, 1, $numBuckets) AS predicted_quintile_score,
        quintile_stats_object.mean,
        quintile_stats_object.sd,
        quintile_stats_object.lower_bound,
        quintile_stats_object.upper_bound
    FROM
        generate_series(1, 5) AS quintiles (quintile)
        JOIN (VALUES (TRUE), (FALSE)) AS keep (keep) ON TRUE
        LEFT JOIN useful_data ON (useful_data.keep = keep.keep)
        JOIN quintile_stats_object ON (quintile_stats_object.quintile = quintiles.quintile)
    GROUP BY
        quintiles.quintile,
        quintile_stats_object.mean,
        quintile_stats_object.sd,
        quintile_stats_object.lower_bound,
        quintile_stats_object.upper_bound,
        keep.keep
),
result AS (
    SELECT
        keep.keep,
        histogram(useful_data.predicted_quintile_scores[quintiles.quintile], 0, 1, $numBuckets) AS predicted_score
    FROM
        generate_series(1, 5) AS quintiles (quintile)
        JOIN (VALUES (TRUE), (FALSE)) AS keep (keep) ON TRUE
        LEFT JOIN useful_data ON (useful_data.keep = keep.keep)
    GROUP BY
        keep.keep
)
SELECT
    json_agg(result) AS result,
    json_agg(quintile_result) AS quintile_result
FROM
    result
    JOIN quintile_result ON TRUE;
