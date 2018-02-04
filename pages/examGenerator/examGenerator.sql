-- BLOCK generated_score
WITH calculated_predicted_score_quintiles AS (
    SELECT
        calculate_predicted_score_quintiles(a.id) AS obj
    FROM
        assessments AS a
    WHERE
        a.id=$assessment_id
),
random_scores AS (
    SELECT
        first((calc.obj).generated_assessment_question_ids) AS generated_assessment_question_ids,
        array_agg(slice(((calc.obj).final_result)::DOUBLE PRECISION[][], quintiles.quintile)) AS random_scores
    FROM
        calculated_predicted_score_quintiles AS calc
        JOIN generate_series(1,5) AS quintiles (quintile) ON TRUE
),
random_scores_flattened AS (
    SELECT
        unnest(random_scores) AS score_perc,
        generated_assessment_question_ids AS generated_assessment_question_ids
    FROM
        random_scores
)
SELECT
    histogram(random_scores_flattened.score_perc, 0, 1, 10),
    generated_assessment_question_ids
FROM
    random_scores_flattened
GROUP BY generated_assessment_question_ids;

-- BLOCK generated_score_quintiles
WITH random_scores AS (
    SELECT
        slice((calculate_predicted_score_quintiles(a.id)).final_result, quintiles.quintile) AS random_score_quintiles,
        quintiles.quintile
    FROM
        generate_series(1,5) AS quintiles (quintile)
        JOIN assessments AS a ON TRUE
    WHERE
        a.id=$assessment_id
),
random_scores_flattened AS (
    SELECT
        random_scores.quintile,
        unnest(random_score_quintiles) AS score_perc
    FROM
        random_scores
)
SELECT
    random_scores_flattened.quintile,
    histogram(random_scores_flattened.score_perc, 0, 1, 10),
    avg(random_scores_flattened.score_perc) AS mean,
    stddev_pop(random_scores_flattened.score_perc) AS sd,
    avg(random_scores_flattened.score_perc) - stddev_pop(random_scores_flattened.score_perc) AS minus_one_sd
FROM
    random_scores_flattened
GROUP BY
    random_scores_flattened.quintile
ORDER BY
    random_scores_flattened.quintile;

-- BLOCK generated_score_quintiles_new
WITH calculated_predicted_score_quintiles AS (
    SELECT
        calculate_predicted_score_quintiles(a.id) AS obj
    FROM
        assessments AS a
    WHERE
        a.id=$assessment_id
),
random_scores_2 AS (
    SELECT
        first((calc.obj).generated_assessment_question_ids) AS generated_assessment_question_ids
    FROM
        calculated_predicted_score_quintiles AS calc
),
random_scores AS (
    SELECT
        slice((calculate_predicted_score_quintiles(a.id)).final_result, quintiles.quintile) AS random_score_quintiles,
        quintiles.quintile
    FROM
                generate_series(1,5) AS quintiles (quintile)
        JOIN assessments AS a ON TRUE
    WHERE
        a.id=$assessment_id
),
random_scores_flattened AS (
    SELECT
        random_scores.quintile,
        unnest(random_score_quintiles) AS score_perc
    FROM
        random_scores
),
stats AS (
    SELECT
        random_scores_flattened.quintile,
        histogram(random_scores_flattened.score_perc, 0, 1, 10),
        avg(random_scores_flattened.score_perc) AS mean,
        stddev_pop(random_scores_flattened.score_perc) AS sd,
        avg(random_scores_flattened.score_perc) - stddev_pop(random_scores_flattened.score_perc) AS minus_one_sd
    FROM
        random_scores_flattened
    GROUP BY
        random_scores_flattened.quintile
    ORDER BY
        random_scores_flattened.quintile
)
SELECT
    array_agg(mean) AS means,
    array_agg(sd) AS sds,
    a.mode AS assessment_mode,
    a.type AS assessment_type,
    random_scores_2.generated_assessment_question_ids,
    filter_generated_assessments(random_scores_2.generated_assessment_question_ids, array_agg(mean), array_agg(sd), a.type, a.mode) AS filtered
FROM
    stats
    JOIN random_scores_2 ON TRUE
    JOIN assessments AS a ON TRUE
WHERE
    a.id=$assessment_id
GROUP BY
    a.id,
    random_scores_2.generated_assessment_question_ids;
