CREATE OR REPLACE FUNCTION
    users_select_or_insert(
        IN uid text,
        IN name text,
        IN uin text,
        IN provider text,
        OUT user_id bigint
    )
AS $$
DECLARE
    u users%rowtype;
    new_u users%rowtype;
BEGIN
    -- try and get an existing user with "uid" as the key
    SELECT *
    INTO u
    FROM users
    WHERE users.uid = users_select_or_insert.uid;

    -- if we don't have the user already, make it
    IF NOT FOUND THEN
        INSERT INTO users
            (uid, name, uin, provider)
        VALUES
            (users_select_or_insert.uid, users_select_or_insert.name,
            users_select_or_insert.uin, users_select_or_insert.provider)
        RETURNING * INTO u;

        INSERT INTO audit_logs (table_name, row_id, action,   new_state)
        VALUES                 ('users',      u.id, 'insert', to_jsonb(u));
    END IF;

    -- update user data as needed

    IF name IS NOT NULL AND name IS DISTINCT FROM u.name THEN
        UPDATE users
        SET name = users_select_or_insert.name
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'name', u.id, 'update',
            jsonb_build_object('name', name),
            to_jsonb(u), to_jsonb(new_u));
    END IF;

    IF uin IS NOT NULL AND uin IS DISTINCT FROM u.uin THEN
        UPDATE users
        SET uin = users_select_or_insert.uin
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'uin', u.id, 'update',
            jsonb_build_object('uin', uin),
            to_jsonb(u), to_jsonb(new_u));
    END IF;

    IF provider IS NOT NULL AND provider IS DISTINCT FROM u.provider THEN
        UPDATE users
        SET provider = users_select_or_insert.provider
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'provider', u.id, 'update',
            jsonb_build_object('provider', provider),
            to_jsonb(u), to_jsonb(new_u));
    END IF;

    -- return value
    user_id := u.user_id;
    if user_id IS NULL THEN
        RAISE EXCEPTION 'computed NULL user_id';
    END IF;
    if user_id < 1 OR user_id > 1000000000 THEN
        RAISE EXCEPTION 'user_id out of bounds';
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
