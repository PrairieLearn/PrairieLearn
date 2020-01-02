-- BLOCK assessment_stats
SELECT number, mean, std
FROM assessments_stats($assessment_id);

-- BLOCK assessment_duration_stats
SELECT format_interval(mean) AS mean
FROM assessments_duration_stats($assessment_id) AS d;

-- BLOCK select_assessment_id_from_tid
SELECT
    a.id AS assessment_id
FROM
    assessments AS a
WHERE
    a.tid = $tid
    AND a.course_instance_id = $course_instance_id
    AND a.deleted_at IS NULL;

-- BLOCK tids
SELECT
    array_agg(a.tid) AS tids
FROM
    assessments AS a
WHERE
    a.course_instance_id = $course_instance_id
    AND a.deleted_at IS NULL;
