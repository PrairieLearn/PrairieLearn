-- BLOCK insert_user
INSERT INTO users
        (uid)
VALUES ($uid)
ON CONFLICT (uid) DO UPDATE
SET uid = users.uid -- re-set uid to force row to be returned
RETURNING *;

-- BLOCK insert_enrollment_all_course_instances
INSERT INTO enrollments AS e
        (role,  user_id, course_instance_id)
(
    SELECT
        $role, $user_id, ci.id
    FROM
        course_instances AS ci
    WHERE
        ci.course_id = $course_id
)
ON CONFLICT (user_id, course_instance_id) DO UPDATE
SET
    role = EXCLUDED.role
WHERE
    EXCLUDED.role != e.role; -- FIXME: why is this WHERE clause here? I worry that it's important but I don't understand.

-- BLOCK insert_enrollment_one_course_instance
INSERT INTO enrollments
        (user_id,  role,  course_instance_id)
VALUES ($user_id, $role, $course_instance_id)
ON CONFLICT (user_id,course_instance_id) DO UPDATE
SET
    role = EXCLUDED.role;

-- BLOCK downgrade_enrollments
UPDATE enrollments AS e
SET role = 'Student'
FROM
    users AS u,
    course_instances AS ci
WHERE
    u.id = e.user_id
    AND ci.id = $course_instance_id
    AND ci.id = e.course_instance_id
    AND u.id NOT IN (SELECT unnest($preserve_user_ids::integer[]))
    AND e.role != 'Student';
