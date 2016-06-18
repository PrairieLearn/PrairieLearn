-- BLOCK questions
WITH
test_questions_list AS (
    SELECT tq.*,q.qid,q.title,top.name AS topic_name,
        z.title AS zone_title,z.number AS zone_number,
        (lag(z.id) OVER (PARTITION BY z.id ORDER BY tq.number) IS NULL) AS start_new_zone
    FROM test_questions AS tq
    JOIN questions AS q ON (q.id = tq.question_id)
    JOIN zones AS z ON (z.id = tq.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    WHERE z.test_id = $1
    AND tq.deleted_at IS NULL
    AND q.deleted_at IS NULL
    ORDER BY (z.number, z.id, tq.number)
),
course_tests AS (
    SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,
        ts.abbrev AS test_set_abbrev,ts.name AS test_set_name
    FROM tests AS t
    JOIN test_sets AS ts ON (t.test_set_id = ts.id)
    WHERE t.course_instance_id = $2
    AND t.deleted_at IS NULL
),
test_lists AS (
    SELECT tql.id,
        JSONB_AGG(JSONB_BUILD_OBJECT(
                'label',t.test_set_abbrev || t.number,
                'test_id',t.id,
                'color',t.color)
              ORDER BY (t.test_set_name, t.test_set_id, t.number))
          FILTER (
              WHERE t.test_set_id IS NOT NULL
              AND t.id != $1
          )
          AS tests
    FROM test_questions_list AS tql
    LEFT JOIN (
        test_questions AS tq
        JOIN course_tests as t ON (t.id = tq.test_id)
    ) ON (tq.question_id = tql.question_id)
    WHERE tq.deleted_at IS NULL
    GROUP BY tql.id,tql.question_id
)
SELECT tql.*,tl.tests
FROM test_questions_list AS tql
LEFT JOIN test_lists AS tl ON (tql.id = tl.id)
ORDER BY (tql.zone_number, tql.zone_id, tql.number);


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
