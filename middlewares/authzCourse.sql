-- BLOCK select_authz_data
WITH
actual_course_permissions AS (
    SELECT
        cp.course_role
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = $authn_user_id
        AND cp.course_id = $course_id
),
administrator_course_permissions AS (
    SELECT
        'Owner'::enum_course_role AS course_role
    WHERE
        $is_administrator
),
effective_course_permissions AS (
    SELECT
        max(cp.course_role) AS course_role
    FROM
        (
            SELECT * FROM actual_course_permissions
            UNION
            SELECT * FROM administrator_course_permissions
        ) AS cp
)
SELECT
    cp.course_role AS authn_course_role,
    (cp.course_role >= 'Viewer') AS authn_has_permission_view,
    (cp.course_role >= 'Editor') AS authn_has_permission_edit,
    (cp.course_role >= 'Owner') AS authn_has_permission_own,
    to_jsonb(c.*) AS course
FROM
    effective_course_permissions AS cp
    JOIN courses AS c ON (TRUE)
WHERE
    c.id = $course_id;
