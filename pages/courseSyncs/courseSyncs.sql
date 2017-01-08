-- BLOCK select_sync_job_sequences
SELECT
    js.*,
    format_date_full_compact(js.start_date) AS start_date_formatted,
    u.uid AS user_uid
FROM
    job_sequences AS js
    JOIN users AS u on (u.user_id = js.user_id)
WHERE
    js.course_id = $course_id
    AND (js.type = 'sync' OR js.type = 'git_status')
ORDER BY
    js.start_date DESC, js.id;
