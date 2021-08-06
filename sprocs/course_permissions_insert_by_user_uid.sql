CREATE FUNCTION
    course_permissions_insert_by_user_uid(
        IN course_id bigint,
        IN uid text,
        IN course_role enum_course_role,
        IN authn_user_id bigint,
        OUT user_id bigint
    )
AS $$
DECLARE
    new_row course_permissions;
BEGIN
    SELECT u.user_id INTO user_id
    FROM users AS u
    WHERE u.uid = course_permissions_insert_by_user_uid.uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no user with uid: %', uid;
    END IF;

    INSERT INTO course_permissions AS cp
        (user_id, course_id, course_role)
    VALUES
        (user_id, course_id, course_role)
    ON CONFLICT ON CONSTRAINT course_permissions_user_id_course_id_key
    DO UPDATE
    SET course_role = EXCLUDED.course_role
    WHERE cp.course_role < EXCLUDED.course_role
    RETURNING
        cp.* INTO new_row;

    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id, table_name,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, course_id, user_id, 'course_permissions',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
