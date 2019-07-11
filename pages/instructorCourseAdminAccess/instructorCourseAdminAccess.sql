-- BLOCK select_course_users
SELECT
    u.user_id,
    u.uid,
    u.name,
    cp.course_role
FROM
    course_permissions AS cp
    JOIN users AS u ON (u.user_id = cp.user_id)
WHERE
    cp.course_id = $course_id;
