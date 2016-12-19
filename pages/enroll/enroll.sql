-- BLOCK select_course_instances
SELECT
    c.short_name || ': ' || c.title || ', ' || ci.long_name AS label,
    c.short_name || ', ' || ci.short_name AS short_label,
    ci.id AS course_instance_id,
    (e.id IS NOT NULL) AS enrolled
FROM
    users AS u
    CROSS JOIN (
        course_instances AS ci
        JOIN courses AS c ON (c.id = ci.course_id)
    )
    LEFT JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = ci.id)
WHERE
    u.id = $user_id
    AND ci.deleted_at IS NULL
    AND check_course_instance_access(ci.id, COALESCE(e.role, 'Student'), u.uid, current_timestamp)
ORDER BY
    c.short_name, c.title, c.id, ci.number DESC, ci.id;

-- BLOCK enroll
INSERT INTO enrollments AS e
        (user_id, course_instance_id, role)
(
    SELECT
        u.id, $course_instance_id, 'Student'
    FROM
        users AS u
    WHERE
        u.id = $user_id
        AND check_course_instance_access($course_instance_id, 'Student', u.uid, current_timestamp)
)
RETURNING e.id;

-- BLOCK unenroll
DELETE FROM enrollments AS e
USING
    users AS u
WHERE
    u.id = $user_id
    AND e.user_id = $user_id
    AND e.course_instance_id = $course_instance_id
    AND check_course_instance_access($course_instance_id, e.role, u.uid, current_timestamp)
RETURNING e.id;
