-- BLOCK select_sync_job
SELECT
    j.*,
    format_date_full_compact(j.start_date) AS start_date_formatted,
    format_date_full_compact(j.finish_date) AS finish_date_formatted,
    u.uid AS user_uid,
    authn_u.uid AS authn_user_uid
FROM
    jobs AS j
    LEFT JOIN users AS u ON (u.id = j.user_id)
    LEFT JOIN users AS authn_u ON (authn_u.id = j.authn_user_id)
WHERE
    j.id = $job_id
    AND j.course_id = $course_id;
