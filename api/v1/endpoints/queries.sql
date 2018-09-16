-- BLOCK select_assessments
WITH issue_count AS (
    SELECT
        a.id AS assessment_id,
        count(*) AS open_issue_count
    FROM
        assessments AS a
        JOIN issues AS i ON (i.assessment_id = a.id)
    WHERE
        a.course_instance_id = $course_instance_id
        AND i.course_caused
        AND i.open
    GROUP BY a.id
)
SELECT
    a.id::int,
    a.tid,
    a.type,
    a.number as assessment_number,
    a.title,
    a.assessment_set_id::int,
    aset.abbreviation AS assessment_set_abbreviation,
    aset.name AS assessment_set_name,
    aset.heading AS assessment_set_heading,
    aset.color AS assessment_set_color,
    (aset.abbreviation || a.number) as label
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    LEFT JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    LEFT JOIN LATERAL authz_assessment(a.id, $authz_data, $req_date, ci.display_timezone) AS aa ON TRUE
WHERE
    ci.id = $course_instance_id
    AND a.deleted_at IS NULL
    AND aa.authorized
    AND ($assessment_id::bigint IS NULL OR a.id = $assessment_id)
ORDER BY
    aset.number, a.order_by, a.id;

-- BLOCK select_assessment_instances
SELECT
    jsonb_build_object(
        'id', u.user_id::int,
        'uid', u.uid,
        'role', coalesce(e.role, 'None'::enum_role)
    ) AS user,
    (aset.name || ' ' || a.number) AS assessment_label,
    ai.id::int,
    ai.points,
    ai.max_points,
    ai.score_perc,
    ai.number,
    ai.open,
    CASE
        WHEN ai.open AND ai.date_limit IS NOT NULL
            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
        WHEN ai.open THEN 'Open'
        ELSE 'Closed'
    END AS time_remaining,
    format_date_iso8601(ai.date, ci.display_timezone) AS date_formatted,
    format_interval(ai.duration) AS duration,
    EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
    (row_number() OVER (PARTITION BY u.user_id ORDER BY score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score
FROM
    assessments AS a
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
WHERE
    a.id = $assessment_id
ORDER BY
    e.role DESC, u.uid, u.user_id, ai.number, ai.id;