-- BLOCK lookup_credential
SELECT * FROM lti_credentials WHERE consumer_key = $consumer_key AND deleted_at IS NULL;

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
        AND check_course_instance_access($course_instance_id, $role, u.uid, $req_date)
)
ON CONFLICT ON CONSTRAINT enrollments_user_id_course_instance_id_key
DO UPDATE SET role = $role
RETURNING e.id;

-- BLOCK ltilink
SELECT * FROM lti_links WHERE course_instance_id = $course_instance_id
AND resource_link_id = $resource_link_id
AND assessment_id IS NOT NULL
AND deleted_at IS NULL;
