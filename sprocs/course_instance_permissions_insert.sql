CREATE FUNCTION
    course_instance_permissions_insert(
        course_id bigint,
        user_id bigint,
        course_instance_id bigint,
        course_instance_role enum_course_instance_role,
        authn_user_id bigint
    ) returns void
AS $$
-- prefer column references over variables, needed for ON CONFLICT
#variable_conflict use_column
DECLARE
    uid text;
    course_permission_id bigint;
    new_row course_instance_permissions;
BEGIN
    SELECT u.uid INTO uid
    FROM users AS u
    WHERE u.user_id = course_instance_permissions_insert.user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no user with user_id: %', user_id;
    END IF;

    SELECT cp.id INTO course_permission_id
    FROM course_permissions AS cp
    WHERE cp.user_id = course_instance_permissions_insert.user_id
    AND cp.course_id = course_instance_permissions_insert.course_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no course permission for user with uid: %', uid;
    END IF;

    INSERT INTO course_instance_permissions AS cip
        (course_instance_id, course_instance_role, course_permission_id)
    VALUES
        (course_instance_id, course_instance_role, course_permission_id)
    ON CONFLICT (course_instance_id, course_permission_id)
    DO UPDATE
    SET course_instance_role = EXCLUDED.course_instance_role
    WHERE cip.course_instance_role < EXCLUDED.course_instance_role
    RETURNING
        cip.* INTO new_row;

    INSERT INTO audit_logs
        (
            authn_user_id,
            course_id,
            user_id,
            table_name,
            row_id,
            action,
            new_state
        )
    VALUES
        (
            authn_user_id,
            course_id,
            user_id,
            'course_instance_permissions',
            new_row.id,
            'insert',
            to_jsonb(new_row)
        );
END;
$$ LANGUAGE plpgsql VOLATILE;
