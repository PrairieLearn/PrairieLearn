SELECT
    u.*
FROM
    enrollments AS e
    JOIN users as u ON (u.user_id = e.user_id)
    JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
WHERE
    ci.id = $course_instance_id
    AND ci.deleted_at IS NULL
    AND u.uid = $uid
    AND e.role >= 'TA';
