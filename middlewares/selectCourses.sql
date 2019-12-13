-- BLOCK select_courses
SELECT
    c.*
FROM
    pl_courses AS c
    JOIN authz_course($user_id, c.id, $is_administrator) AS permissions_course ON TRUE
WHERE
    c.deleted_at IS NULL
    AND (permissions_course->>'has_course_permission_edit')::BOOLEAN IS TRUE
ORDER BY
    c.short_name, c.title, c.id;
