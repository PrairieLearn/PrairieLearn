-- BLOCK select_sync_jobs
SELECT
    j.*,
    u.uid AS user_uid
FROM
    jobs AS j
    JOIN course_instances AS ci ON (ci.id = j.course_instance_id)
    JOIN users AS u on (u.id = j.user_id)
WHERE
    ci.course_id = $course_id
ORDER BY
    j.start_date DESC, j.id;
