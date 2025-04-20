CREATE FUNCTION
    users_select_or_insert_and_enroll_lti(
        IN uid text,
        IN name text,
        IN lti_course_instance_id bigint,
        IN lti_user_id text,
        IN lti_context_id text,
        IN req_date timestamptz,
        OUT user_id bigint,
        OUT has_access boolean
    )
AS $$
DECLARE
    lti_institution_id bigint;
    u users%rowtype;
    new_u users%rowtype;
BEGIN
    -- find the LTI institution
    SELECT i.id
    INTO lti_institution_id
    FROM institutions AS i
    WHERE i.short_name = 'LTI';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Could not find institution with short_name="LTI"';
    END IF;

    -- try and get an existing user with uid
    SELECT *
    INTO u
    FROM users
    WHERE
        users.uid = users_select_or_insert_and_enroll_lti.uid
        AND users.institution_id = lti_institution_id;

    -- if we don't have the user already, make it
    IF NOT FOUND THEN
        INSERT INTO users
            (uid, name, lti_course_instance_id, lti_user_id, lti_context_id, institution_id)
        VALUES
            (users_select_or_insert_and_enroll_lti.uid, users_select_or_insert_and_enroll_lti.name,
             users_select_or_insert_and_enroll_lti.lti_course_instance_id,
             users_select_or_insert_and_enroll_lti.lti_user_id,
             users_select_or_insert_and_enroll_lti.lti_context_id, lti_institution_id)
        RETURNING * INTO u;

        INSERT INTO audit_logs (table_name, row_id, action,   new_state)
        VALUES                 ('users', u.user_id, 'insert', to_jsonb(u));
    END IF;

    -- update user data as needed
    IF name IS NOT NULL AND name IS DISTINCT FROM u.name THEN
        UPDATE users
        SET name = users_select_or_insert_and_enroll_lti.name
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

    -- verify user_id exists
    user_id := u.user_id;
    if user_id IS NULL THEN
        RAISE EXCEPTION 'computed NULL user_id';
    END IF;
    if user_id < 1 OR user_id > 1000000000 THEN
        RAISE EXCEPTION 'user_id out of bounds';
    END IF;

    -- check course instance access
    SELECT check_course_instance_access(lti_course_instance_id, u.uid, u.institution_id, req_date) INTO has_access;

    -- if user has access, then ensure enrollment
    IF has_access THEN
        INSERT INTO enrollments (course_instance_id, user_id)
        VALUES (lti_course_instance_id, u.user_id)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
