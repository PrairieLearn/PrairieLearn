-- BLOCK insert_xc101_viewer_if_has_course
INSERT INTO course_permissions (user_id, course_id, course_role)
    SELECT
        $user_id, c.id, 'Viewer'
    FROM
        pl_courses AS c
    WHERE
        c.example_course
        AND EXISTS ( -- is the user at least a Viewer in some course?
            SELECT 1 FROM course_permissions AS cp
            WHERE cp.user_id = $user_id AND cp.course_role IN ('Owner', 'Editor', 'Viewer')
        )
ON CONFLICT DO NOTHING

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
        coalesce(jsonb_agg(jsonb_build_object(
            'label', c.short_name || ': ' || c.title,
            'id', c.id
        ) ORDER BY c.short_name, c.title, c.id), '[]'::jsonb) AS courses
    FROM
        pl_courses AS c
        LEFT JOIN course_permissions_for_user AS cp ON (cp.course_id = c.id)
    WHERE
        c.deleted_at IS NULL
        AND (
            $is_administrator
            OR (cp.id IS NOT NULL)
        )
),
enrollments_for_user AS (
    SELECT
        e.*,
        u.uid,
        u.institution_id
    FROM
        enrollments AS e
        JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
        u.user_id = $user_id
),
course_instances_list AS (
    SELECT
        coalesce(jsonb_agg(jsonb_build_object(
            'label', c.short_name || ': ' || c.title || ', ' || ci.long_name,
            'id', ci.id
        ) ORDER BY c.short_name, c.title, c.id, d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC), '[]'::jsonb) AS course_instances
    FROM
        pl_courses AS c
        JOIN course_instances AS ci ON (ci.course_id = c.id)
        LEFT JOIN enrollments_for_user AS e ON (e.course_instance_id = ci.id),
        LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id) AS d
    WHERE
        ci.deleted_at IS NULL
        AND c.deleted_at IS NULL
        AND (
            $is_administrator
            OR (
                e.id IS NOT NULL
                AND check_course_instance_access(ci.id, e.role, e.uid, e.institution_id, $req_date)
            )
        )
)
SELECT
    cl.courses,
    cil.course_instances
FROM
    courses_list AS cl,
    course_instances_list AS cil;
