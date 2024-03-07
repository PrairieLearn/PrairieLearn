CREATE FUNCTION
    administrators_insert_by_user_uid(
        uid text,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    user_id bigint;
    new_row administrators;
BEGIN
    SELECT u.user_id INTO user_id
    FROM users AS u
    WHERE u.uid = administrators_insert_by_user_uid.uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'no user with uid: %', uid;
    END IF;

    BEGIN
        INSERT INTO administrators AS adm
            (user_id)
        VALUES
            (user_id)
        RETURNING
            adm.* INTO new_row;
    EXCEPTION
        WHEN unique_violation THEN RAISE EXCEPTION 'user already is administrator, uid: %', uid;
    END;

    INSERT INTO audit_logs
        (authn_user_id, user_id, table_name,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, user_id, 'administrators',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
