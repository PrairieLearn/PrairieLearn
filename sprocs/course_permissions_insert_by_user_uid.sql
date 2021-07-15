CREATE FUNCTION
    course_permissions_insert_by_user_uid(
        course_id bigint,
        uid text,
        course_role enum_course_role,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    user_id bigint;
    new_row course_permissions;
BEGIN
    SELECT u.user_id INTO user_id
    FROM users AS u
    WHERE u.uid = course_permissions_insert_by_user_uid.uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no user with uid: %', uid;
    END IF;

    BEGIN
        INSERT INTO course_permissions AS cp
            (user_id, course_id, course_role)
        VALUES
            (user_id, course_id, course_role)
        RETURNING
            cp.* INTO new_row;
    EXCEPTION
        WHEN unique_violation THEN RAISE EXCEPTION 'user already in course, uid: %', uid;
    END;

    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id, table_name,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, course_id, user_id, 'course_permissions',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
