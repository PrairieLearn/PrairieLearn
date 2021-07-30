CREATE FUNCTION
    course_permissions_delete_users_without_access(
        course_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    PERFORM (
        WITH cp_with_access AS (
            SELECT
                cp.user_id,
                bool_and(cp.course_role = 'None' AND coalesce(cip.course_instance_role, 'None'::enum_course_instance_role) = 'None') AS should_delete
            FROM
                course_permissions AS cp
                LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
                LEFT JOIN course_instances AS ci ON (ci.id = cip.course_instance_id AND ci.course_id = cp.course_id)
            WHERE
                cp.course_id = course_permissions_delete_users_without_access.course_id
                AND ci.deleted_at IS NULL
            GROUP BY
                cp.user_id
        )
        SELECT
            count(course_permissions_delete(course_permissions_delete_users_without_access.course_id, cp.user_id, authn_user_id))
        FROM
            cp_with_access AS cp
        WHERE
            cp.should_delete IS TRUE
    );
END;
$$ LANGUAGE plpgsql VOLATILE;
