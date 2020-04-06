-- BLOCK select
SELECT
    to_jsonb(enum_range(
        enum_first(null::enum_role),
        $authn_role
    )) AS available_roles,
    (
        SELECT
            jsonb_agg(u.uid ORDER BY u.uid)
        FROM
            users AS u
            JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = $course_instance_id)
        WHERE
            e.role <= $authn_role
    ) AS available_uids;

-- BLOCK enroll
INSERT INTO enrollments (user_id, course_instance_id, role)
VALUES ($user_id, $course_instance_id, 'Student')
ON CONFLICT DO NOTHING;
