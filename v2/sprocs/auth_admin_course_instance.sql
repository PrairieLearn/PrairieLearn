CREATE OR REPLACE FUNCTION
    auth_admin_course_instance (
        course_instance_id integer,
        auth_data JSONB
    ) RETURNS boolean
AS $$
SELECT EXISTS (
    SELECT
        1
    FROM
        enrollments AS e
        JOIN users as u ON (u.id = e.user_id)
        JOIN course_instances AS ci ON (ci.id = e.course_instance_id)
    WHERE
        ci.id = course_instance_id
        AND ci.deleted_at IS NULL
        AND u.uid = auth_data->>'auth_uid'
        AND e.role >= 'TA'
);
$$ LANGUAGE SQL;
