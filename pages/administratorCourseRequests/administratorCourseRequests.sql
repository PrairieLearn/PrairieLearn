-- BLOCK get_requests
WITH select_course_request_jobs AS (
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
                'status', r.approved_status,
                'approved_by_name', ua.name,
                'jobs', coalesce(j.jobs, '{}'::jsonb)
            )),
            '[]'::jsonb
        ) AS course_requests
    FROM course_requests AS r
    INNER JOIN users AS u ON u.user_id = r.user_id
    LEFT JOIN users AS ua on ua.user_id = r.approved_by
    LEFT JOIN select_course_request_jobs AS j ON j.id = r.id
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
    institutions,
    course_requests
FROM
    select_institutions,
    select_course_requests;

-- BLOCK update_course_request
UPDATE course_requests
SET approved_by = $user_id,
    approved_status = $action
WHERE course_requests.id = $id;
