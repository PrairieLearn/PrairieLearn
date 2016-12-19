-- BLOCK select_course_instances
SELECT
    c.short_name || ': ' || c.title || ', ' || ci.long_name AS label,
    ci.id AS course_instance_id
FROM
    users AS u
    JOIN enrollments AS e ON (e.user_id = u.id)
    JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    JOIN courses AS c ON (c.id = ci.course_id)
WHERE
    u.id = $user_id
    AND ci.deleted_at IS NULL
    AND check_course_instance_access(ci.id, e.role, u.uid, current_timestamp)
ORDER BY
    c.short_name, c.title, c.id, ci.number DESC, ci.id;
