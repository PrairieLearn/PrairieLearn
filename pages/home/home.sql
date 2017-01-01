-- BLOCK select_home
WITH
course_permissions_for_user AS (
    SELECT
        *
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = $user_id
),
courses_list AS (
    SELECT
        jsonb_agg(jsonb_build_object(
            'label', c.short_name || ': ' || c.title,
            'id', c.id
        ) ORDER BY c.short_name, c.title, c.id) AS courses
    FROM
        courses AS c
        LEFT JOIN course_permissions_for_user AS cp ON (cp.course_id = c.id)
    WHERE
        $is_administrator
        OR (cp.id IS NOT NULL)
),
enrollments_for_user AS (
    SELECT
        e.*,
        u.uid
    FROM
        enrollments AS e
        JOIN users AS u ON (u.id = e.user_id)
    WHERE
        u.id = $user_id
),
course_instances_list AS (
    SELECT
        jsonb_agg(jsonb_build_object(
            'label', c.short_name || ': ' || c.title || ', ' || ci.long_name,
            'id', ci.id
        ) ORDER BY c.short_name, c.title, c.id, ci.number DESC, ci.id) AS course_instances
    FROM
        courses AS c
        JOIN course_instances AS ci ON (ci.course_id = c.id)
        LEFT JOIN enrollments_for_user AS e ON (e.course_instance_id = ci.id)
    WHERE
        ci.deleted_at IS NULL
        AND (
            $is_administrator
            OR (
                e.id IS NOT NULL
                AND check_course_instance_access(ci.id, e.role, e.uid, current_timestamp)
            )
        )
)
SELECT
    cl.courses,
    cil.course_instances
FROM
    courses_list AS cl,
    course_instances_list AS cil;
