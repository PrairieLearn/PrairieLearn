-- BLOCK questions
SELECT
    tq.*,q.qid,q.title,row_to_json(top) AS topic,
    z.title AS zone_title,z.number AS zone_number,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY tq.number) IS NULL) AS start_new_zone,
    tests_for_question(q.id,ci.id,t.id) AS tests
FROM
    test_questions AS tq
    JOIN questions AS q ON (q.id = tq.question_id)
    JOIN zones AS z ON (z.id = tq.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN tests AS t ON (t.id = tq.test_id)
    JOIN course_instances AS ci ON (ci.id = t.course_instance_id)
WHERE
    t.id = $1
    AND tq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, tq.number;


-- BLOCK test_stats
SELECT * FROM test_stats WHERE id = $1;


-- BLOCK test_duration_stats
SELECT
    format_interval(tds.median) AS median,
    format_interval(tds.min) AS min,
    format_interval(tds.max) AS max,
    format_interval(tds.mean) AS mean,
    threshold_seconds,
    threshold_labels,
    hist
FROM test_duration_stats AS tds
WHERE id = $1;


-- BLOCK user_test_scores
SELECT
    u.id,u.uid,u.name,e.role,uts.score_perc,
    format_interval(utd.duration) AS duration,
    EXTRACT(EPOCH FROM utd.duration) AS duration_secs
FROM tests AS t
CROSS JOIN users AS u
JOIN enrollments AS e ON (e.user_id = u.id)
JOIN user_test_scores AS uts ON (uts.user_id = u.id AND uts.test_id = t.id)
JOIN user_test_durations AS utd ON (utd.user_id = u.id AND utd.test_id = t.id)
WHERE t.id = $1
AND t.course_instance_id = e.course_instance_id
ORDER BY e.role DESC,u.uid,u.id;
