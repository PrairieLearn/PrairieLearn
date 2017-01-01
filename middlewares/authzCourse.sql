-- BLOCK select_authz_data
WITH select_course_permission AS (
    SELECT
        CASE
            WHEN $is_administrator THEN 'Owner'
            ELSE cp.course_role
        END AS course_role
    FROM
        users AS u
        LEFT JOIN course_permissions AS cp ON (cp.user_id = u.id)
    WHERE
        u.id = $authn_user_id
        AND (
            cp.course_id = $course_id
            OR (
                (cp.id IS NULL)
                AND $is_administrator
            )
        )
)
SELECT
    cp.course_role AS authn_course_role,
    (cp.course_role >= 'Viewer') AS authn_has_permission_view,
    (cp.course_role >= 'Editor') AS authn_has_permission_edit,
    (cp.course_role >= 'Owner') AS authn_has_permission_own,
    to_jsonb(c.*) AS course
FROM
    select_course_permission AS cp
    JOIN courses AS c ON (TRUE)
WHERE
    c.id = $course_id;
