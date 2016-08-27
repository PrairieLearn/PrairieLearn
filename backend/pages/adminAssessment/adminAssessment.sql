-- BLOCK questions
SELECT
    aq.*,q.qid,q.title,row_to_json(top) AS topic,
    z.title AS zone_title,z.number AS zone_number,
    (lag(z.id) OVER (PARTITION BY z.id ORDER BY aq.number) IS NULL) AS start_new_zone,
    assessments_for_question(q.id,ci.id,a.id) AS assessments
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    JOIN zones AS z ON (z.id = aq.zone_id)
    JOIN topics AS top ON (top.id = q.topic_id)
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    a.id = $assessment_id
    AND aq.deleted_at IS NULL
    AND q.deleted_at IS NULL
ORDER BY z.number, z.id, aq.number;


-- BLOCK assessment_stats
SELECT * FROM assessment_stats WHERE id = $assessment_id;


-- BLOCK assessment_duration_stats
SELECT
    format_interval(tds.median) AS median,
    format_interval(tds.min) AS min,
    format_interval(tds.max) AS max,
    format_interval(tds.mean) AS mean,
    threshold_seconds,
    threshold_labels,
    hist
FROM assessment_duration_stats AS tds
WHERE id = $assessment_id;


-- BLOCK user_assessment_scores
SELECT
    u.id,u.uid,u.name,e.role,uts.score_perc,
    format_interval(utd.duration) AS duration,
    EXTRACT(EPOCH FROM utd.duration) AS duration_secs
FROM assessments AS a
CROSS JOIN users AS u
JOIN enrollments AS e ON (e.user_id = u.id)
JOIN user_assessment_scores AS uts ON (uts.user_id = u.id AND uts.assessment_id = a.id)
JOIN user_assessment_durations AS utd ON (utd.user_id = u.id AND utd.assessment_id = a.id)
WHERE a.id = $assessment_id
AND a.course_instance_id = e.course_instance_id
ORDER BY e.role DESC,u.uid,u.id;
