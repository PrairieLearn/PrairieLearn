-- BLOCK lookup_credential
SELECT * FROM lti_credentials WHERE consumer_key = $consumer_key AND deleted_at IS NULL;

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
        AND check_course_instance_access($course_instance_id, 'Student', u.uid, $req_date)
)
RETURNING e.id;
