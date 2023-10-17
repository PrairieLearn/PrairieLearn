CREATE FUNCTION
    course_permissions_update_role(
        course_id bigint,
        user_id bigint,
        course_role enum_course_role,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    new_row course_permissions%ROWTYPE;
BEGIN
    UPDATE course_permissions AS cp
    SET
        course_role = course_permissions_update_role.course_role
    WHERE
        cp.course_id = course_permissions_update_role.course_id
        AND cp.user_id = course_permissions_update_role.user_id
    RETURNING
        cp.* INTO new_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course_permission';
    END IF;

    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id,
        table_name,            column_name,  row_id,
        action,  parameters,
        new_state)
    VALUES
        (authn_user_id, course_id, user_id,
        'course_permissions', 'course_role', new_row.id,
        'update', jsonb_build_object('course_role', course_role),
        to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
