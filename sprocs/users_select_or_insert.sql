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
    END IF;

    -- uid is globally unique, but we check that we haven't mixed
    -- up providers somehow. This probably isn't strictly needed.
    IF u.provider IS DISTINCT FROM provider THEN
        RAISE EXCEPTION 'provider mismatch for user_id %', u.user_id;
    END IF;

    -- update user data as needed

    IF uid IS NOT NULL AND uid IS DISTINCT FROM u.uid THEN
        UPDATE users
        SET uid = users_select_or_insert.uid
        WHERE users.user_id = u.user_id;
    END IF;

    IF name IS NOT NULL AND name IS DISTINCT FROM u.name THEN
        UPDATE users
        SET name = users_select_or_insert.name
        WHERE users.user_id = u.user_id;
    END IF;

    IF uin IS NOT NULL AND uin IS DISTINCT FROM u.uin THEN
        UPDATE users
        SET uin = users_select_or_insert.uin
        WHERE users.user_id = u.user_id;
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
