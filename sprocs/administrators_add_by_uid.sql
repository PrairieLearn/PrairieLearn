CREATE OR REPLACE FUNCTION
    administrators_add_by_uid(
        uid text,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    user_id bigint;
    new_row administrators;
BEGIN
    SELECT u.id INTO user_id
    FROM users AS u
    WHERE u.uid = administrators_add_by_uid.uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no user with uid: %s', uid;
    END IF;

    BEGIN
        INSERT INTO administrators AS adm
            (user_id)
        VALUES
            (user_id)
        RETURNING
            adm.* INTO new_row;
    EXCEPTION
        WHEN unique_violation THEN RAISE EXCEPTION 'user already is administrator, uid: %s', uid;
    END;

    INSERT INTO audit_logs
        (authn_user_id, user_id, tablename,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, user_id, 'administrators',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
