CREATE OR REPLACE FUNCTION
    users_select_or_insert_lti(
        IN uid text,
        IN name text,
        IN lti_course_instance_id bigint,
        IN lti_user_id text,
        IN lti_context_id text,
        OUT user_id bigint
    )
AS $$
DECLARE
    u users%rowtype;
    new_u users%rowtype;
BEGIN
    -- try and get an existing user with uid
    SELECT *
    INTO u
    FROM users
    WHERE
        users.uid = users_select_or_insert_lti.uid
    ;

    -- if we don't have the user already, make it
    IF NOT FOUND THEN
        INSERT INTO users
            (uid, name, lti_course_instance_id, lti_user_id, lti_context_id, provider)
        VALUES
            (users_select_or_insert_lti.uid, users_select_or_insert_lti.name,
             users_select_or_insert_lti.lti_course_instance_id,
             users_select_or_insert_lti.lti_user_id,
             users_select_or_insert_lti.lti_context_id, 'lti')
        RETURNING * INTO u;

        INSERT INTO audit_logs (table_name, row_id, action,   new_state)
        VALUES                 ('users', u.user_id, 'insert', to_jsonb(u));
    END IF;

    -- update user data as needed

    IF name IS NOT NULL AND name IS DISTINCT FROM u.name THEN
        UPDATE users
        SET name = users_select_or_insert_lti.name
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'name', u.user_id, 'update',
            jsonb_build_object('name', name),
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
