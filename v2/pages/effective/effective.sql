-- BLOCK select
WITH user_enrollment AS (
    SELECT
        e.*
    FROM
        enrollments AS e
    WHERE 
        e.user_id = $authn_user_id
        AND e.course_instance_id = $course_instance_id
)
SELECT
    to_jsonb(enum_range(
        enum_first(null::enum_role),
        least($authn_role, user_enrollment.role)
    )) AS available_roles,
    (
        SELECT
            jsonb_agg(u.uid)
        FROM
            users AS u
            JOIN enrollments AS e ON (e.user_id = u.id AND e.course_instance_id = $course_instance_id)
        WHERE
            e.role <= $authn_role
    ) AS available_uids
FROM
    user_enrollment;
