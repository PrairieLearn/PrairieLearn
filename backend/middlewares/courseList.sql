WITH q AS (
SELECT c.id AS course_id,c.short_name
FROM enrollments AS e
    JOIN users AS u ON (e.user_id = u.id)
    JOIN course_instances AS ci ON (e.course_instance_id = ci.id)
    JOIN courses AS c ON (ci.course_id = c.id)
WHERE uid = $1
    AND role >= 'TA'
    AND ci.deleted_at IS NULL
GROUP BY c.id
)
SELECT q.short_name,ci.id AS course_instance_id
FROM q
    JOIN course_instances AS ci ON (ci.course_id = q.course_id)
WHERE ci.deleted_at IS NULL
ORDER BY q.short_name;
