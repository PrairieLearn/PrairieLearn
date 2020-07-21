-- BLOCK select_assessment_instances
SELECT
    (aset.name || ' ' || a.number) AS assessment_label,
    u.user_id, u.uid, u.name, coalesce(e.role, 'None'::enum_role) AS role,
    substring(u.uid from '^[^@]+') AS username,
    ai.score_perc, ai.points, ai.max_points,
    ai.number,ai.id AS assessment_instance_id,ai.open,
    CASE
        WHEN ai.open AND ai.date_limit IS NOT NULL
            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
        WHEN ai.open THEN 'Open'
        ELSE 'Closed'
    END AS time_remaining,
    format_date_full_compact(ai.date, ci.display_timezone) AS date_formatted,
    format_interval(ai.duration) AS duration,
    EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
    EXTRACT(EPOCH FROM ai.duration) / 60 AS duration_mins,
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

-- BLOCK select_assessment_instances_group
SELECT
    group_info.gid, group_info.group_name, group_info.uid_list,
    ai.score_perc, ai.points, ai.max_points,
    ai.number, ai.id AS assessment_instance_id, ai.open,
    CASE
        WHEN ai.open AND ai.date_limit IS NOT NULL
            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / (60 * 1000)))::text || ' min'
        WHEN ai.open THEN 'Open'
        ELSE 'Closed'
    END AS time_remaining,
    format_date_full_compact(ai.date, ci.display_timezone) AS date_formatted,
    format_interval(ai.duration) AS duration,
    EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
    EXTRACT(EPOCH FROM ai.duration) / 60 AS duration_mins,
    (row_number() OVER (PARTITION BY group_info.gid ORDER BY score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score
FROM
    (
        SELECT
            AVG(gc.assessment_id) AS assessment_id, AVG(gc.course_instance_id) AS course_instance_id,
            gr.id AS gid, gr.name AS group_name,
            array_agg(u.uid) AS uid_list
        FROM
            assessments AS a
            JOIN group_configs AS gc ON (gc.assessment_id = a.id AND gc.deleted_at IS NULL)
            -- intend to include deleted groups without using a 'gr.deleted_at IS NULL' statement
            JOIN groups AS gr ON (gr.group_config_id = gc.id)
            JOIN group_users AS gu ON (gr.id = gu.group_id)
            JOIN users AS u ON (u.user_id = gu.user_id)
        WHERE
            a.id = $assessment_id
        GROUP BY
            gr.id
    ) AS group_info
    JOIN course_instances AS ci ON (ci.id = group_info.course_instance_id)
    JOIN assessment_instances AS ai ON (ai.assessment_id = group_info.assessment_id AND ai.group_id = group_info.gid)
ORDER BY
    group_info.gid, ai.number, ai.id;

-- BLOCK open
WITH results AS (
    UPDATE assessment_instances AS ai
    SET
        open = true,
        date_limit = NULL,
        auto_close = FALSE,
        modified_at = now()
    WHERE
        ai.id = $assessment_instance_id
    RETURNING
        ai.open,
        ai.id AS assessment_instance_id
)
INSERT INTO assessment_state_logs AS asl
        (open, assessment_instance_id, auth_user_id)
(
    SELECT
        true, results.assessment_instance_id, $authn_user_id
    FROM
        results
);
