-- BLOCK select_course_info
SELECT
    jsonb_agg(jsonb_build_object(
        'uid', u.uid,
        'name', u.name,
        'course_role', cp.course_role
    ) ORDER BY u.uid, u.id) AS course_users
FROM
    course_permissions AS cp
    JOIN users AS u ON (u.id = cp.user_id)
WHERE
    cp.course_id = $course_id;
