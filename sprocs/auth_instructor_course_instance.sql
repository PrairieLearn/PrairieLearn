DROP FUNCTION IF EXISTS auth_admin_course_instance(integer, jsonb);
DROP FUNCTION IF EXISTS auth_admin_course_instance(integer, enum_auth_action, jsonb);

CREATE OR REPLACE FUNCTION
    auth_instructor_course_instance (
        course_instance_id bigint,
        auth_action enum_auth_action,
        auth_data JSONB
    ) RETURNS TABLE (authorized boolean, auth_user_id bigint)
AS $$
SELECT
    EXISTS (
        SELECT 1
        FROM enrollments AS e
        WHERE
            e.course_instance_id = ci.id
            AND e.user_id = u.user_id
            AND (
                (auth_action = 'View' AND e.role >= 'TA')
                OR (auth_action = 'Edit' AND e.role >= 'Instructor')
            )
    ) AS authorized,
    u.user_id AS auth_user_id
FROM
    users AS u,
    course_instances AS ci
WHERE
    u.uid = auth_data->>'auth_uid'
    AND ci.id = course_instance_id
    AND ci.deleted_at IS NULL;
$$ LANGUAGE SQL STABLE;
