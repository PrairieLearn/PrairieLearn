CREATE FUNCTION
    course_instance_permissions_update_role(
        course_id bigint,
        user_id bigint,
        course_instance_id bigint,
        course_instance_role enum_course_instance_role,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    new_row course_instance_permissions%ROWTYPE;
BEGIN
    UPDATE course_instance_permissions AS cip
    SET
        course_instance_role = course_instance_permissions_update_role.course_instance_role
    FROM
        course_permissions AS cp
    WHERE
        cip.course_instance_id = course_instance_permissions_update_role.course_instance_id
        AND cp.id = cip.course_permission_id
        AND cp.user_id = course_instance_permissions_update_role.user_id
        AND cp.course_id = course_instance_permissions_update_role.course_id
    RETURNING
        cip.* INTO new_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course_instance_permission';
    END IF;

    INSERT INTO audit_logs
        (
            authn_user_id,
            course_id,
            user_id,
            table_name,
            column_name,
            row_id,
            action,
            parameters,
            new_state
        )
    VALUES
        (
            authn_user_id,
            course_id,
            user_id,
            'course_instance_permissions',
            'course_instance_role',
            new_row.id,
            'update',
            jsonb_build_object('course_instance_role', course_instance_role),
            to_jsonb(new_row)
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
