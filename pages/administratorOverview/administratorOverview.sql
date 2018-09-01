-- BLOCK select
WITH
select_administrator_users AS (
    SELECT
        coalesce(
            jsonb_agg(to_json(u) ORDER BY u.uid, u.user_id),
            '[]'::jsonb
        ) AS administrator_users
    FROM
        administrators AS adm
        JOIN users AS u ON (u.user_id = adm.user_id)
),
select_courses AS (
    SELECT
        coalesce(
            jsonb_agg(to_json(c) ORDER BY c.short_name, c.title, c.id),
            '[]'::jsonb
        ) AS courses
    FROM
        pl_courses AS c
    WHERE
        c.deleted_at IS NULL
),
select_networks AS (
    SELECT
        coalesce(
            jsonb_agg(jsonb_build_object(
                    'network', n.network,
                    'start_date', coalesce(format_date_full_compact(lower(n.during), config_select('display_timezone')), '—'),
                    'end_date', coalesce(format_date_full_compact(upper(n.during), config_select('display_timezone')), '—'),
                    'location', n.location,
                    'purpose', n.purpose
                ) ORDER BY n.during, n.network),
            '[]'::jsonb
        ) AS networks
    FROM
        exam_mode_networks AS n
),
select_config AS (
    SELECT
        coalesce(
            jsonb_agg(to_json(c) ORDER BY c.key),
            '[]'::jsonb
        ) AS configs
    FROM
        config AS c
),
select_question_render_cache_stats AS (
    SELECT
        jsonb_build_object(
            'question_cache_hit_rate', AVG(pvl.panel_render_cache_hit_count / pvl.panel_render_count),
            'panel_cache_hit_rate', (CAST(SUM(pvl.panel_render_cache_hit_count) AS FLOAT) / SUM(pvl.panel_render_count))
        ) AS question_render_cache_stats
    FROM
        page_view_logs AS pvl
)
SELECT
    administrator_users,
    courses,
    networks,
    configs,
    question_render_cache_stats
FROM
    select_administrator_users,
    select_courses,
    select_networks,
    select_config,
    select_question_render_cache_stats;

-- BLOCK select_course
SELECT * FROM pl_courses WHERE id = $course_id;
