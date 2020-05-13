-- BLOCK get_mode
SELECT COALESCE($force_mode, ip_to_mode($ip, $req_date)) AS mode;

-- BLOCK get_course_instances
WITH lti_institution AS (
  SELECT * FROM institutions WHERE short_name = 'LTI'
)
SELECT
    c.short_name || ': ' || ci.short_name AS display_ci,
    ci.id AS course_instance_id
FROM
    course_instances AS ci
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    CROSS JOIN lti_institution
WHERE
    ci.deleted_at IS NULL
    AND check_course_instance_access(ci.id, 'Student', NULL, lti_institution.id, $req_date)
ORDER BY
    c.short_name ASC, ci.short_name DESC
;
