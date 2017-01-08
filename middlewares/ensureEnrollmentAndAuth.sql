INSERT INTO enrollments AS e (user_id, course_instance_id, role)
(
    SELECT
        val.user_id, val.course_instance_id, val.role
    FROM
        (VALUES ($user_id::integer, $course_instance_id::integer, 'Student'::enum_role)) AS val (user_id, course_instance_id, role)
        JOIN users AS u ON (u.user_id = val.user_id)
    WHERE
        check_course_instance_access(val.course_instance_id, val.role, u.uid, CURRENT_TIMESTAMP)
)
ON CONFLICT (user_id, course_instance_id) DO UPDATE
SET role = e.role
RETURNING *;
