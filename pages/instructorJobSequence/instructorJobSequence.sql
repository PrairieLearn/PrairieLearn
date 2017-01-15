-- BLOCK select_job_sequence
WITH member_jobs AS (
    SELECT
        j.*,
        format_date_full_compact(j.start_date, c.display_timezone) AS start_date_formatted,
        format_date_full_compact(j.finish_date, c.display_timezone) AS finish_date_formatted,
        u.uid AS user_uid,
        authn_u.uid AS authn_user_uid
    FROM
        jobs AS j
        JOIN pl_courses AS c ON (c.id = j.course_id)
        LEFT JOIN users AS u ON (u.user_id = j.user_id)
        LEFT JOIN users AS authn_u ON (authn_u.user_id = j.authn_user_id)
    WHERE
        j.job_sequence_id = $job_sequence_id
        AND j.course_id IS NOT DISTINCT FROM $course_id
),
aggregated_member_jobs AS (
    SELECT
        count(*) AS job_count,
        coalesce(array_agg(to_jsonb(j.*)), ARRAY[]::JSONB[]) AS jobs
    FROM
        member_jobs AS j
)
SELECT
    js.*,
    format_date_full_compact(js.start_date, c.display_timezone) AS start_date_formatted,
    format_date_full_compact(js.finish_date, c.display_timezone) AS finish_date_formatted,
    u.uid AS user_uid,
    authn_u.uid AS authn_user_uid,
    aggregated_member_jobs.*
FROM
    job_sequences AS js
    JOIN pl_courses AS c ON (c.id = js.course_id)
    LEFT JOIN users AS u ON (u.user_id = js.user_id)
    LEFT JOIN users AS authn_u ON (authn_u.user_id = js.authn_user_id),
    aggregated_member_jobs
WHERE
    js.id = $job_sequence_id
    AND js.course_id IS NOT DISTINCT FROM $course_id;
