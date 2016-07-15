SELECT *
FROM enrollments AS e
    JOIN users as u ON (u.id = e.user_id)
    JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
WHERE ci.id = $1
    AND ci.deleted_at IS NULL
    AND u.uid = $2
    AND e.role >= 'TA';
