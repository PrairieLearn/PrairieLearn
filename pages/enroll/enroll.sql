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
    LATERAL (SELECT min(ar.start_date) AS start_date, max(ar.end_date) AS end_date FROM course_instance_access_rules AS ar WHERE ar.course_instance_id = ci.id) AS d
WHERE
    u.user_id = $user_id
    AND ci.deleted_at IS NULL
    AND c.deleted_at IS NULL
    AND check_course_instance_access(ci.id, COALESCE(e.role, 'Student'), u.uid, u.institution_id, $req_date)
ORDER BY
    c.short_name, c.title, c.id, d.start_date DESC NULLS LAST, d.end_date DESC NULLS LAST, ci.id DESC;

-- BLOCK enroll
INSERT INTO enrollments AS e
        (user_id, course_instance_id, role)
(
    SELECT
        u.user_id, $course_instance_id, 'Student'
    FROM
        users AS u
    WHERE
        u.user_id = $user_id
        AND check_course_instance_access($course_instance_id, 'Student', u.uid, u.institution_id, $req_date)
)
RETURNING e.id;

-- BLOCK unenroll
DELETE FROM enrollments AS e
USING
    users AS u
WHERE
    u.user_id = $user_id
    AND e.user_id = $user_id
    AND e.course_instance_id = $course_instance_id
    AND check_course_instance_access($course_instance_id, e.role, u.uid, u.institution_id, $req_date)
RETURNING e.id;
