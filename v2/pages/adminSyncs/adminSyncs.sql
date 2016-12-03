-- BLOCK select_sync_jobs
SELECT
    j.*,
    u.uid AS user_uid
FROM
    jobs AS j
    JOIN users AS u on (u.id = j.user_id)
WHERE
    j.course_id = $course_id
ORDER BY
    j.start_date DESC, j.id;
