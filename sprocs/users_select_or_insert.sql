CREATE FUNCTION
    users_select_or_insert(
        IN uid text,
        IN name text,
        IN uin text,
        IN authn_provider_name text,
        OUT user_id bigint
    )
AS $$
DECLARE
    u users%rowtype;
    institution institutions%rowtype;
    new_u users%rowtype;
BEGIN
    -- try and get an existing user with "uin" as the key
    SELECT *
    INTO u
    FROM users
    WHERE users.uin = users_select_or_insert.uin;

    -- if we couldn't match "uin", try "uid"
    IF u.user_id IS NULL THEN
        SELECT *
        INTO u
        FROM users
        WHERE users.uid = users_select_or_insert.uid;
    END IF;

    -- if we found a user, with institution_id not 1, try their existing institution for a uid match to avoid checking all institutions
    IF (u.institution_id IS NOT NULL) AND (u.institution_id != 1) THEN
        SELECT i.*
        INTO institution
        FROM institutions AS i
        WHERE
            i.id = u.institution_id
            AND users_select_or_insert.uid ~ i.uid_regexp;
    END IF;

    -- if we don't have an institution at this point, try all of them for a uid match
    IF institution.id IS NULL THEN
        SELECT i.*
        INTO institution
        FROM institutions AS i
        WHERE users_select_or_insert.uid ~ i.uid_regexp
        ORDER BY i.id ASC
        LIMIT 1;
    END IF;

    -- if we've matched an institution, make sure the authn_provider is valid for it
    IF institution.id IS NOT NULL THEN
        PERFORM *
        FROM
            institution_authn_providers AS iap
            JOIN authn_providers AS ap ON (ap.id = iap.authn_provider_id)
        WHERE
            iap.institution_id = institution.id
            AND ap.name = authn_provider_name;

        IF NOT FOUND THEN
            RAISE EXCEPTION '"%" authentication provider is not allowed for institution "%"', authn_provider_name, institution.long_name;
        END IF;
    END IF;

    -- if we didn't find an institution by uid match, use institution 1 and check short_name='Default'
    IF institution.id IS NULL THEN
        SELECT i.*
        INTO institution
        FROM institutions AS i
        WHERE i.id = 1;

        IF institution.short_name != 'Default' THEN
            RAISE EXCEPTION 'institution_id=1 must have short_name="Default"';
        END IF;
    END IF;

    -- if we don't have the user already, make it
    IF u.user_id IS NULL THEN
        INSERT INTO users
            (uid, name, uin, institution_id)
        VALUES
            (users_select_or_insert.uid, users_select_or_insert.name,
            users_select_or_insert.uin, institution.id)
        RETURNING * INTO u;

        INSERT INTO audit_logs (table_name, row_id, action,   new_state)
        VALUES                 ('users', u.user_id, 'insert', to_jsonb(u));
    END IF;

    -- update user data as needed

    IF uid IS NOT NULL AND uid IS DISTINCT FROM u.uid THEN
        UPDATE users
        SET uid = users_select_or_insert.uid
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'uid', u.user_id, 'update',
            jsonb_build_object('uid', uid),
            to_jsonb(u), to_jsonb(new_u));
    END IF;

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
            ('users', 'name', u.user_id, 'update',
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
            ('users', 'uin', u.user_id, 'update',
            jsonb_build_object('uin', uin),
            to_jsonb(u), to_jsonb(new_u));
    END IF;

    IF institution.id IS DISTINCT FROM u.institution_id THEN
        UPDATE users
        SET institution_id = institution.id
        WHERE users.user_id = u.user_id
        RETURNING * INTO new_u;

        INSERT INTO audit_logs
            (table_name, column_name, row_id, action,
            parameters,
            old_state, new_state)
        VALUES
            ('users', 'institution_id', u.user_id, 'update',
            jsonb_build_object('institution_id', institution.id),
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
