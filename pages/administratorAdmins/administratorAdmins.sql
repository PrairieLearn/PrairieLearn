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
select_question_render_cache_stats AS (
    SELECT
        jsonb_build_object(
            'question_cache_hit_rate', AVG(pvl.panel_render_cache_hit_count / pvl.panel_render_count),
            'panel_cache_hit_rate', (CAST(SUM(pvl.panel_render_cache_hit_count) AS FLOAT) / SUM(pvl.panel_render_count))
        ) AS question_render_cache_stats
    FROM
        page_view_logs AS pvl
    WHERE
        pvl.date > now() - interval '1 day'
)
SELECT
    administrator_users,
    question_render_cache_stats
FROM
    select_administrator_users,
    select_question_render_cache_stats;
