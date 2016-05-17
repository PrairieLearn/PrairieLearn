CREATE OR REPLACE VIEW test_stats AS
WITH
stats_from_data AS (
    SELECT
        test_id AS id,
        count(score_perc) AS number,
        min(score_perc) AS min,
        max(score_perc) AS max,
        round(avg(score_perc)) AS mean,
        round(stddev_samp(score_perc)) AS std,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY score_perc) AS median,
        count(score_perc <= 0 OR NULL) AS n_zero,
        count(score_perc >= 100 OR NULL) AS n_hundred,
        round(CAST(count(score_perc <= 0 OR NULL) AS double precision) / count(score_perc) * 100) AS n_zero_perc,
        round(CAST(count(score_perc >= 100 OR NULL) AS double precision) / count(score_perc) * 100) AS n_hundred_perc,
        histogram(score_perc, 0, 100, 10) AS score_hist
    FROM student_test_scores
    GROUP BY id
),
zero_stats AS (
    SELECT
        id,
        0 AS number,
        0 AS min,
        0 AS max,
        0 AS mean,
        0 AS std,
        0 AS median,
        0 AS n_zero,
        0 AS n_hundred,
        0 AS n_zero_perc,
        0 AS n_hundred_perc,
        array_fill(0, ARRAY[10]) AS score_hist
    FROM tests AS t
    WHERE NOT EXISTS (
        SELECT * FROM stats_from_data WHERE stats_from_data.id = t.id
    )
    AND t.deleted_at IS NULL
)
SELECT * FROM stats_from_data
UNION
SELECT * FROM zero_stats
;
