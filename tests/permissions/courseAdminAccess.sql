-- BLOCK select_permissions
SELECT
    u.uid,
    cp.course_role,
    cip.course_instance_role
FROM
    users AS u
    JOIN course_permissions AS cp ON cp.user_id = u.user_id AND cp.course_id = $course_id
    LEFT JOIN course_instance_permissions AS cip ON cip.course_permission_id = cp.id AND cip.course_instance_id = $course_instance_id;
