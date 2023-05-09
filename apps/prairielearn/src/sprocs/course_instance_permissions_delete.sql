CREATE FUNCTION
    course_instance_permissions_delete(
        course_id bigint,
        user_id bigint,
        course_instance_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row course_instance_permissions%ROWTYPE;
BEGIN
    DELETE FROM course_instance_permissions AS cip
    USING course_permissions AS cp
    WHERE
        cip.course_instance_id = course_instance_permissions_delete.course_instance_id
        AND cp.id = cip.course_permission_id
        AND cp.user_id = course_instance_permissions_delete.user_id
        AND cp.course_id = course_instance_permissions_delete.course_id
    RETURNING
        cip.* INTO old_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course_instance_permission';
    END IF;

    INSERT INTO audit_logs
        (
            authn_user_id,
            course_id,
            user_id,
            table_name,
            row_id,
            action,
            old_state
        )
    VALUES
        (
            authn_user_id,
            course_id,
            user_id,
            'course_instance_permissions',
            old_row.id,
            'delete',
            to_jsonb(old_row)
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
