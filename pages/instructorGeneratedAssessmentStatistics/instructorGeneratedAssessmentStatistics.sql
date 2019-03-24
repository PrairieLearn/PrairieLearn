-- BLOCK get_generated_assessments_calculation_status
SELECT
    a.generated_assessments_calculation_status
FROM
    assessments AS a
WHERE
    a.id = $assessment_id;

-- BLOCK set_generated_assessments_calculation_status
UPDATE
    assessments AS a
SET
    generated_assessments_calculation_status=$status
WHERE
    a.id = $assessment_id;

-- BLOCK generated_assessment_statistics
SELECT
    assessment_quintile_statistics.*
FROM
    assessment_quintile_statistics
WHERE
    assessment_quintile_statistics.assessment_id = $assessment_id;

-- BLOCK generated_assessment_stats_last_updated
SELECT
    CASE
        WHEN a.generated_assessment_stats_last_updated IS NULL THEN 'never'
        ELSE format_date_full_compact(a.generated_assessment_stats_last_updated, ci.display_timezone)
    END AS generated_assessment_stats_last_updated
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id;

-- get quintile stats for assessment
-- generate a bunch of assessments and return
-- assessment_number
-- predicted_score
-- whether or not we will keep it
-- then make histogram out of data

-- BLOCK generated_assessment_distribution
WITH quintile_stats_before_flattened AS (
    SELECT
        assessment_quintile_statistics.quintile,
        assessment_quintile_statistics.mean_score AS quintile_mean_before,
        assessment_quintile_statistics.score_sd AS quintile_sd_before
    FROM
        assessment_quintile_statistics
    WHERE
        assessment_quintile_statistics.assessment_id=$assessment_id
),
quintile_stats_before AS (
    SELECT
        array_agg(quintile_stats_before_flattened.quintile_mean_before ORDER BY quintile_stats_before_flattened.quintile) AS means,
        array_agg(quintile_stats_before_flattened.quintile_sd_before ORDER BY quintile_stats_before_flattened.quintile) AS sds
    FROM
        quintile_stats_before_flattened
),
relevant_generated_assessments AS (
    SELECT
        ga.generated_aq_ids,
        ga.id AS generated_assessment_id
    FROM
        generated_assessments AS ga
    WHERE
        ga.assessment_id = $assessment_id
    LIMIT
      1000
),
generated_assessments_with_cutoff_info AS (
    SELECT
        calculate_predicted_assessment_score(relevant_generated_assessments.generated_aq_ids) AS predicted_score,
        filter_generated_assessment(relevant_generated_assessments.generated_aq_ids, quintile_stats_before.means, quintile_stats_before.sds, 'Exams', $num_sds) AS keep,
        relevant_generated_assessments.generated_assessment_id
    FROM
        quintile_stats_before
        CROSS JOIN relevant_generated_assessments
),
num_exams_kept AS (
    SELECT
        count(*) AS num_exams_kept
    FROM
        generated_assessments_with_cutoff_info AS ga
    WHERE
        ga.keep
),
sd_values AS (
    SELECT
        stddev_samp(ga.predicted_score) AS sd_before,
        stddev_samp(ga.predicted_score) FILTER (WHERE ga.keep) AS sd_after
    FROM
        generated_assessments_with_cutoff_info AS ga
),
sd_improvement AS (
    SELECT
        100 * (sd_values.sd_before - sd_values.sd_after) / sd_values.sd_before AS sd_perc_improvement
    FROM
        sd_values
),
hist AS (
    SELECT
        keep.keep,
        histogram(ga.predicted_score, 0, 1, $num_buckets) AS predicted_score_hist
    FROM
        generated_assessments_with_cutoff_info AS ga
        RIGHT JOIN (VALUES (TRUE), (FALSE)) AS keep (keep) ON (ga.keep = keep.keep)
    GROUP BY
        keep.keep
),
hist_json AS (
    SELECT
        json_agg(hist) AS json
    FROM
        hist
),
predicted_assessment_score_quintiles AS (
    SELECT
        calculate_predicted_assessment_score_quintiles(ga.generated_aq_ids)
            AS predicted_assessment_score_quintiles,
        generated_assessments_with_cutoff_info.keep
    FROM
        generated_assessments AS ga
        JOIN generated_assessments_with_cutoff_info ON (generated_assessments_with_cutoff_info.generated_assessment_id = ga.id)
    WHERE
        ga.assessment_id = $assessment_id
),
quintile_stats_object AS (
    SELECT
        array_avg(predicted_assessment_score_quintiles.predicted_assessment_score_quintiles)
            FILTER (WHERE predicted_assessment_score_quintiles.keep) AS quintile_means_after,
        array_sqrt(array_var(predicted_assessment_score_quintiles.predicted_assessment_score_quintiles)
            FILTER (WHERE predicted_assessment_score_quintiles.keep)) AS quintile_sds_after,
        array_avg(predicted_assessment_score_quintiles.predicted_assessment_score_quintiles) AS quintile_means_before,
        array_sqrt(array_var(predicted_assessment_score_quintiles.predicted_assessment_score_quintiles)) AS quintile_sds_before
    FROM
        predicted_assessment_score_quintiles
),
quintile_stats AS (
    SELECT
        quintile_stats_object.quintile_means_after[quintiles.quintile] AS quintile_mean_after,
        quintile_stats_object.quintile_sds_after[quintiles.quintile] AS quintile_sd_after,
        quintile_stats_before_flattened.quintile_mean_before,
        quintile_stats_before_flattened.quintile_sd_before,
        quintiles.quintile
    FROM
        quintile_stats_object
        CROSS JOIN generate_series(1, 5) AS quintiles (quintile)
        JOIN quintile_stats_before_flattened ON (quintile_stats_before_flattened.quintile = quintiles.quintile)
),
quintile_stats_json AS (
    SELECT
        json_agg(quintile_stats) AS json
    FROM
        quintile_stats
)
SELECT
    hist_json.json,
    num_exams_kept.num_exams_kept,
    sd_values.sd_before,
    sd_values.sd_after,
    sd_improvement.sd_perc_improvement,
    quintile_stats_json.json AS quintile_stats
FROM
    hist_json
    JOIN num_exams_kept ON TRUE
    JOIN sd_values ON TRUE
    JOIN sd_improvement ON TRUE
    JOIN quintile_stats ON TRUE
    CROSS JOIN quintile_stats_json;

-- BLOCK update_num_sds_value
UPDATE
    assessments AS a
SET
    num_sds = $num_sds_value
WHERE
    a.id=$assessment_id;
