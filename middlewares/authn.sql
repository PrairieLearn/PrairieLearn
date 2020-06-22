-- BLOCK enroll_user_as_instructor
INSERT INTO enrollments
    (user_id, course_instance_id, role)
(
    SELECT
        u.user_id, ci.id, 'Instructor'
    FROM
        users AS u,
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        u.uid = $uid
        AND c.short_name = $course_short_name
)
ON CONFLICT (user_id, course_instance_id) DO UPDATE
SET
    role = 'Instructor';
