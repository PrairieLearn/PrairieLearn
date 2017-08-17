-- BLOCK select_assessments
WITH error_count AS (
    SELECT
        a.id AS assessment_id,
        count(*) AS open_error_count
    FROM
        assessments AS a
        JOIN assessment_questions AS aq ON (aq.assessment_id = a.id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN errors AS e ON (e.question_id = q.id)
    WHERE
        a.course_instance_id = $course_instance_id
        AND e.course_caused
        AND e.open
    GROUP BY a.id
)
SELECT
    a.id,
    a.tid,
    a.course_instance_id,
    a.type,
    a.number as assessment_number,
    a.title,
    a.assessment_set_id,
    tstats.number,
    tstats.mean,
    tstats.std,
    tstats.min,
    tstats.max,
    tstats.median,
    tstats.n_zero,
    tstats.n_hundred,
    tstats.n_zero_perc,
    n_hundred_perc,
    tstats.score_hist,
    format_interval(dstats.mean) AS mean_duration,
    format_interval(dstats.median) AS median_duration,
    dstats.min AS min_duration,
    dstats.max AS max_duration,
    aset.abbreviation,
    aset.name,
    aset.heading,
    aset.color,
    (aset.abbreviation || a.number) as label,
    (lag(aset.id) OVER (PARTITION BY aset.id ORDER BY a.order_by, a.id) IS NULL) AS start_new_set,
    coalesce(ec.open_error_count, 0) AS open_error_count
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN LATERAL assessments_stats(a.id) AS tstats ON TRUE
    LEFT JOIN LATERAL assessments_duration_stats(a.id) AS dstats ON TRUE
    LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
    LEFT JOIN error_count AS ec ON (ec.assessment_id = a.id)
WHERE
    ci.id = $course_instance_id
    AND a.deleted_at IS NULL
    AND aa.authorized
ORDER BY
    aset.number, a.order_by, a.id;
