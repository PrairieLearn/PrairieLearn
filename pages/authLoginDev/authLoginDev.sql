-- BLOCK enroll
INSERT INTO enrollments AS e
        (user_id, course_instance_id, role)
(
    SELECT
        u.user_id, $course_instance_id, $role
    FROM
        users AS u
    WHERE
        u.user_id = $user_id
        AND check_course_instance_access($course_instance_id, $role, u.uid, u.institution_id, $req_date)
)
ON CONFLICT (user_id, course_instance_id)
DO UPDATE SET role = $role
RETURNING e.id;
