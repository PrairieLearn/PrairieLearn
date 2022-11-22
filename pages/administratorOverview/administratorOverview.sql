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
select_course_request_jobs AS (
    SELECT
        cr.id,
        count(js.start_date) AS num_jobs,
        jsonb_agg(jsonb_build_object(
            'start_date', js.start_date,
            'finish_date', js.finish_date,
            'authn_user_id', u.user_id,
            'authn_user_name', u.name,
            'status', js.status,
            'id', js.id,
            'number', js.number
        )) AS jobs
    FROM job_sequences AS js
    LEFT JOIN course_requests AS cr ON cr.id = js.course_request_id
    LEFT JOIN users AS u ON js.authn_user_id = u.user_id
    GROUP BY cr.id
),
select_course_requests AS (
    SELECT
        coalesce(
            jsonb_agg(jsonb_build_object(
                'id', r.id,
                'short_name', r.short_name,
                'title', r.title,
                'user_name', u.name,
                'user_id', u.uid,
                'github_user', r.github_user,
                'first_name', r.first_name,
                'last_name', r.last_name,
                'work_email', r.work_email,
                'institution', r.institution,
                'status', r.approved_status,
                'jobs', coalesce(j.jobs, '{}'::jsonb)
            )),
            '[]'::jsonb
        ) AS course_requests
    FROM course_requests AS r
    INNER JOIN users AS u ON u.user_id = r.user_id
    LEFT JOIN select_course_request_jobs AS j ON j.id = r.id
    WHERE r.approved_status != 'approved' AND r.approved_status != 'denied'
),
select_courses AS (
    SELECT
        coalesce(
            jsonb_agg(jsonb_set(to_jsonb(c), '{institution}', to_jsonb(i)) ORDER BY i.short_name, c.short_name, c.title, c.id),
            '[]'::jsonb
        ) AS courses
    FROM
        pl_courses AS c
        JOIN institutions AS i ON (i.id = c.institution_id)
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
    WHERE
        pvl.date > now() - interval '1 day'
),
select_institutions_with_authn_providers AS (
    SELECT
        i.*,
        coalesce(
            jsonb_agg(ap.name ORDER BY ap.name),
            '[]'::jsonb
        ) AS authn_providers
    FROM
        institutions AS i
        LEFT JOIN institution_authn_providers AS iap ON (iap.institution_id = i.id)
        LEFT JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
    GROUP BY i.id
),
select_institutions AS (
    SELECT
        coalesce(
            jsonb_agg(i ORDER BY i.short_name),
            '[]'::jsonb
        ) AS institutions
    FROM
        select_institutions_with_authn_providers AS i
)
SELECT
    administrator_users,
    course_requests,
    courses,
    networks,
    configs,
    question_render_cache_stats,
    institutions
FROM
    select_administrator_users,
    select_course_requests,
    select_courses,
    select_networks,
    select_config,
    select_question_render_cache_stats,
    select_institutions;

-- BLOCK select_course
SELECT * FROM pl_courses WHERE id = $course_id;

-- BLOCK update_course_request
UPDATE course_requests
SET approved_by = $user_id,
    approved_status = $action
WHERE course_requests.id = $id;

-- BLOCK select_course_request
SELECT * FROM course_requests WHERE id = $id;
