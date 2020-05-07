-- BLOCK get_mode
SELECT COALESCE($force_mode, ip_to_mode($ip, $req_date)) AS mode;

-- BLOCK get_course_instances
SELECT
    c.short_name || ': ' || ci.short_name AS display_ci,
    ci.id AS course_instance_id
FROM
    course_instances AS ci
    JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
    ci.deleted_at IS NULL
ORDER BY
    c.short_name ASC, ci.short_name DESC
;
