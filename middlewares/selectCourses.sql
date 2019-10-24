-- BLOCK select_courses
WITH
    course_permissions_for_user AS (
        SELECT
            *
        FROM
            course_permissions AS cp
        WHERE
            cp.user_id = $user_id
    )
SELECT
    c.short_name,
    c.id
FROM
    pl_courses AS c
    LEFT JOIN course_permissions_for_user AS cp ON (cp.course_id = c.id)
WHERE
    c.deleted_at IS NULL
    AND (
        $is_administrator
        OR (cp.id IS NOT NULL)
    )
ORDER BY
    c.short_name, c.title, c.id;
