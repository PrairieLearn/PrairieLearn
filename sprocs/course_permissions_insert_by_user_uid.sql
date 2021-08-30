CREATE FUNCTION
    course_permissions_insert_by_user_uid(
        IN course_id bigint,
        IN uid text,
        IN course_role enum_course_role,
        IN authn_user_id bigint,
        OUT user_id bigint
    )
AS $$
-- prefer column references over variables, needed for ON CONFLICT
#variable_conflict use_column
DECLARE
    new_row course_permissions;
BEGIN
    SELECT u.user_id INTO user_id
    FROM users AS u
    WHERE u.uid = course_permissions_insert_by_user_uid.uid;

    IF NOT FOUND THEN
        INSERT INTO users AS u (uid)
        VALUES (uid)
        RETURNING u.user_id INTO user_id;
    END IF;

    INSERT INTO course_permissions AS cp
        (user_id, course_id, course_role)
    VALUES
        (user_id, course_id, course_role)
    ON CONFLICT (user_id, course_id)
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
