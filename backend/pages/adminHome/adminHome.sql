SELECT c.*,array_agg(row_to_json(ci.*) ORDER BY ci.number DESC) AS course_instances
FROM courses AS c
    JOIN course_instances AS ci ON (ci.course_id = c.id)
    JOIN enrollments AS e ON (e.course_instance_id = ci.id)
    JOIN users AS u ON (u.id = e.user_id)
WHERE u.uid = $1
    AND e.role >= 'TA'
    AND ci.deleted_at IS NULL
GROUP BY c.id
ORDER BY c.short_name;
