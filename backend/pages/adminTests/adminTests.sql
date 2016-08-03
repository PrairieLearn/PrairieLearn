SELECT
    t.id,t.tid,t.course_instance_id,t.type,
    t.number as test_number,t.title,t.test_set_id,
    tstats.number,tstats.mean,tstats.std,tstats.min,tstats.max,
    tstats.median,tstats.n_zero,tstats.n_hundred,
    tstats.n_zero_perc,n_hundred_perc,tstats.score_hist,
    dstats.mean AS mean_duration,format_interval(dstats.median) AS median_duration,
    dstats.min AS min_duration,dstats.max AS max_duration,
    ts.abbrev,ts.name,ts.heading,ts.color,
    (ts.abbrev || t.number) as label,
    (lag(ts.id) OVER (PARTITION BY ts.id ORDER BY t.number, t.id) IS NULL) AS start_new_set
FROM tests AS t
LEFT JOIN test_sets AS ts ON (ts.id = t.test_set_id)
LEFT JOIN test_stats AS tstats ON (tstats.id = t.id)
LEFT JOIN test_duration_stats AS dstats ON (dstats.id = t.id)
WHERE t.course_instance_id = $course_instance_id
AND t.deleted_at IS NULL
ORDER BY (ts.number, t.number, t.id);
