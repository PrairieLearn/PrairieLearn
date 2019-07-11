-- BLOCK assessment_stats
SELECT * FROM assessments_stats($assessment_id);

-- BLOCK assessment_duration_stats
SELECT
    format_interval(ads.median) AS median,
    format_interval(ads.min) AS min,
    format_interval(ads.max) AS max,
    format_interval(ads.mean) AS mean,
    EXTRACT(EPOCH FROM ads.median) / 60 AS median_mins,
    EXTRACT(EPOCH FROM ads.min) / 60  AS min_mins,
    EXTRACT(EPOCH FROM ads.max) / 60  AS max_mins,
    EXTRACT(EPOCH FROM ads.mean) / 60  AS mean_mins,
    threshold_seconds,
    threshold_labels,
    hist
FROM assessments_duration_stats($assessment_id) AS ads;

-- BLOCK assessment_score_histogram_by_date
WITH assessment_instances_by_user_and_date AS (
    SELECT
        ai.user_id,
        avg(ai.score_perc) AS score_perc,
        date_trunc('day', ai.date AT TIME ZONE ci.display_timezone) AS date
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN users AS u ON (u.user_id = ai.user_id)
        JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    WHERE
        ai.assessment_id = $assessment_id
        AND e.role = 'Student'
    GROUP BY
        ai.user_id, date_trunc('day', date AT TIME ZONE ci.display_timezone)
)
SELECT
    ai_by_user_and_date.date,
    to_char(ai_by_user_and_date.date, 'DD Mon') AS date_formatted,
    count(score_perc) AS number,
    avg(score_perc) AS mean_score_perc,
    histogram(score_perc, 0, 100, 10)
FROM
    assessment_instances_by_user_and_date AS ai_by_user_and_date
GROUP BY
    ai_by_user_and_date.date
ORDER BY
    ai_by_user_and_date.date;

-- BLOCK user_scores
SELECT
    ai.score_perc,
    EXTRACT(EPOCH FROM ai.duration) AS duration_secs
FROM
    assessment_instances AS ai
WHERE
    ai.assessment_id = $assessment_id;
