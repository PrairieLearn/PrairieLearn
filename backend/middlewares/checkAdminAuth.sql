SELECT *
FROM enrollments AS e
JOIN users as u ON (u.id = e.user_id)
WHERE e.course_instance_id = $1
AND u.uid = $2
AND e.role >= 'TA';
