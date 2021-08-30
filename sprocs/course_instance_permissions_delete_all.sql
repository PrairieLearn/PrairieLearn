CREATE FUNCTION
    course_instance_permissions_delete_all(
        course_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
BEGIN
    PERFORM
        course_instance_permissions_delete(cp.course_id, cp.user_id, cip.course_instance_id, authn_user_id)
    FROM
        course_instance_permissions AS cip
        JOIN course_permissions AS cp ON (
            cp.id = cip.course_permission_id
            AND cp.course_id = course_instance_permissions_delete_all.course_id
        )
        JOIN course_instances AS ci ON (
            ci.id = cip.course_instance_id
            AND ci.course_id = cp.course_id
            AND ci.deleted_at IS NULL
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
