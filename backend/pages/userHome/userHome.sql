WITH
    course_instances_with_enrollments AS ( -- courses we are enrolled in
        SELECT
            ci.*
        FROM
            course_instances AS ci
            JOIN enrollments AS e ON (e.course_instance_id = ci.id)
            JOIN users AS u ON (u.id = e.user_id)
        WHERE
            u.uid = $1
            AND ci.deleted_at IS NULL
            AND check_course_instance_access(ci.id, e.role, u.uid, CURRENT_TIMESTAMP)
    ),
    course_instances_as_student AS ( -- courses we could access as a student
        SELECT
            ci.*
        FROM
            course_instances AS ci
        WHERE
            ci.deleted_at IS NULL
            AND check_course_instance_access(ci.id, 'Student', NULL, CURRENT_TIMESTAMP)
    )
SELECT
    c.id AS course_id,
    c.short_name AS course_short_name,
    c.title AS course_title,
    ci.id AS course_instance_id,
    ci.short_name AS course_instance_short_name,
    ci.long_name AS course_instance_long_name
FROM
    (SELECT * FROM course_instances_with_enrollments
        UNION SELECT * FROM course_instances_as_student) AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
ORDER BY c.short_name, ci.number DESC;
