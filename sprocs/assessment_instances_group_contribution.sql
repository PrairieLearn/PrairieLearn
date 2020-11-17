DROP FUNCTION IF EXISTS assessment_instances_group_contribution(bigint);

CREATE OR REPLACE FUNCTION
    assessment_instances_group_contribution ( 
        a_id bigint
    ) 
    RETURNS TABLE(
        assessment_label text,
        user_id bigint,
        uid text,
        name text,
        role enum_role,
        gid bigint, 
        group_name text, 
        uid_list text[],
        score_perc double precision,
        points double precision,
        max_points double precision,
        number integer,
        open boolean,
        username text,
        assessment_instance_id bigint,
        time_remaining text,
        date_formatted text,
        duration text,
        duration_secs double precision,
        duraction_mins double precision,
        highest_score boolean,
        contribution bigint[]
    )
AS $$
BEGIN
    RETURN query
        WITH
        event_log AS (
            (
                SELECT
                    'New variant'::TEXT AS event_name,
                    v.date,
                    u.user_id AS auth_user_id,
                    ai.id as ai_id
                FROM
                    variants AS v
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                    JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
                    LEFT JOIN users AS u ON (u.user_id = v.authn_user_id)
                WHERE
                    ai.assessment_id = a_id
            )
            UNION
            (
                SELECT
                    'Submission'::TEXT AS event_name,
                    v.date,
                    u.user_id AS auth_user_id,
                    ai.id as ai_id
                FROM
                    submissions AS s
                    JOIN variants AS v ON (v.id = s.variant_id)
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                    JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
                    LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
                WHERE
                    ai.assessment_id = a_id
            )
            UNION
            (
                SELECT
                    'Grade submission'::TEXT AS event_name,
                    v.date,
                    u.user_id AS auth_user_id,
                    ai.id as ai_id
                FROM
                    grading_jobs AS gj
                    JOIN submissions AS s ON (s.id = gj.submission_id)
                    JOIN variants AS v ON (v.id = s.variant_id)
                    JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
                    JOIN assessment_instances AS ai ON (iq.assessment_instance_id = ai.id)
                    LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
                WHERE
                    ai.assessment_id = a_id
                    AND gj.grading_method = 'Internal'
                    AND gj.graded_at IS NOT NULL
            )
        ),
        rw_contribution AS (
            (
                SELECT
                    el.auth_user_id as user_id,
                    el.ai_id as ai_id,
                    COUNT(el.event_name) as contribution
                FROM
                    event_log AS el
                GROUP BY
                    el.auth_user_id,
                    el.ai_id
            )
        ),
        rw_contribution_arr AS (
            (
                SELECT
                    rc.ai_id as ai_id,
                    array_agg(rc.contribution) as contribution
                FROM
                    rw_contribution as rc
                GROUP BY
                    rc.user_id,
                    rc.ai_id
            )
        ),
        assessment_instances_info AS (
            (
                SELECT
                    (aset.name || ' ' || a.number) AS assessment_label,
                    u.user_id AS user_id, u.uid AS uid, u.name AS name, coalesce(e.role, 'None'::enum_role) AS role,
                    gi.id AS gid, gi.name AS group_name, gi.uid_list AS uid_list,
                    substring(u.uid from '^[^@]+') AS username,
                    ai.score_perc AS score_perc, ai.points AS points, ai.max_points AS max_points,
                    ai.number AS number,ai.id AS assessment_instance_id,ai.open AS open,
                    CASE
                        WHEN ai.open AND ai.date_limit IS NOT NULL
                            THEN greatest(0, floor(extract(epoch from (ai.date_limit - current_timestamp)) / 60))::text || ' min'
                        WHEN ai.open THEN 'Open'
                        ELSE 'Closed'
                    END AS time_remaining,
                    format_date_full_compact(ai.date, ci.display_timezone) AS date_formatted,
                    format_interval(ai.duration) AS duration,
                    EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
                    EXTRACT(EPOCH FROM ai.duration) / 60 AS duration_mins,
                    (row_number() OVER (PARTITION BY u.user_id ORDER BY ai.score_perc DESC, ai.number DESC, ai.id DESC)) = 1 AS highest_score
                FROM
                    assessments AS a
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
                    JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
                    LEFT JOIN group_info(a_id) AS gi ON (gi.id = ai.group_id)
                    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
                    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = a.course_instance_id)
                WHERE
                    a.id = a_id
                ORDER BY
                    e.role DESC, u.uid, u.user_id, ai.number, ai.id
            )
        )
        SELECT
            ai.assessment_label AS assessment_label,
            ai.user_id AS user_id,
            ai.uid AS uid,
            ai.name AS name,
            ai.role AS role,
            ai.gid AS gid,
            ai.group_name AS group_name, 
            ai.uid_list AS uid_list,
            ai.score_perc AS score_perc,
            ai.points AS points,
            ai.max_points AS max_points,
            ai.number AS number,
            ai.open AS open,
            ai.username AS username,
            ai.assessment_instance_id AS assessment_instance_id,
            ai.time_remaining AS time_remaining,
            ai.date_formatted AS date_formatted,
            ai.duration AS duration,
            ai.duration_secs AS duration_secs,
            ai.duration_mins AS duration_mins,
            ai.highest_score AS highest_score,
            ca.contribution AS contribution
        FROM
            assessment_instances_info AS ai 
            JOIN rw_contribution_arr AS ca ON (ai.assessment_instance_id = ca.ai_id);

END;
$$ LANGUAGE plpgsql STABLE;

