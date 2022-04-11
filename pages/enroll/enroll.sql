-- BLOCK select_course_instances
SELECT
    c.short_name || ': ' || c.title || ', ' || ci.long_name AS label,
    c.short_name || ', ' || ci.short_name AS short_label,
    ci.id AS course_instance_id,
    (e.id IS NOT NULL) AS enrolled
FROM
    users AS u
    CROSS JOIN (
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    )
    LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id),
    LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id AND ((ar.role > 'Student') IS NOT TRUE)) AS d
WHERE
    u.user_id = $user_id
    AND ci.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND c.example_course IS FALSE
    AND users_is_instructor_in_course(u.user_id, c.id) IS FALSE
    AND check_course_instance_access(ci.id, u.uid, u.institution_id, $req_date)
    AND NOT ci.hide_in_enroll_page
ORDER BY
    c.short_name, c.title, c.id, d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC;

-- BLOCK enroll
INSERT INTO enrollments AS e
    (user_id, course_instance_id)
SELECT
    u.user_id,
    $course_instance_id
FROM
    users AS u
WHERE
    u.user_id = $user_id
    AND check_course_instance_access($course_instance_id, u.uid, u.institution_id, $req_date)
RETURNING e.id;

-- BLOCK unenroll
DELETE FROM enrollments AS e
USING
    users AS u
WHERE
    u.user_id = $user_id
    AND e.user_id = $user_id
    AND e.course_instance_id = $course_instance_id
    AND check_course_instance_access($course_instance_id, u.uid, u.institution_id, $req_date)
RETURNING e.id;

-- BLOCK lti_course_instance_lookup
SELECT
    plc.short_name AS plc_short_name, ci.long_name AS ci_long_name
FROM
    course_instances AS ci
    JOIN pl_courses AS plc ON plc.id = ci.course_id
WHERE
    ci.id = $course_instance_id;
