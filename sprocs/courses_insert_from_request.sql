CREATE OR REPLACE FUNCTION
    courses_insert_from_request(
        IN course_request_id bigint,
        IN display_timezone text,
        IN path text,
        IN repository text,
        IN authn_user_id bigint,
        OUT new_row pl_courses
    )
AS $$
DECLARE
    short_name text;
    title text;
    found_institution_id bigint;
    found_user_id bigint;
BEGIN
    -- select the user, title, and short_name
    SELECT c.user_id, c.title, c.short_name
    INTO found_user_id, title, short_name
    FROM course_requests AS c
    WHERE c.id = course_request_id
    LIMIT 1;

    -- select the user's institution
    SELECT i.id
    INTO found_institution_id
    FROM users AS u
    JOIN institutions AS i ON u.institution_id = i.id
    WHERE u.user_id = found_user_id
    LIMIT 1;

    -- auto-select timezone if it isn't provided
    IF display_timezone IS NULL THEN
        SELECT coalesce(c.display_timezone, 'America/Chicago')
        INTO display_timezone
        FROM pl_courses AS c
        WHERE c.institution_id=found_institution_id
        LIMIT 1;
    END IF;

    BEGIN
        INSERT INTO pl_courses AS c
            (short_name, title, display_timezone, path, repository, institution_id)
        VALUES
            (short_name, title, display_timezone, path, repository, found_institution_id)
        RETURNING
            c.* INTO new_row;
    EXCEPTION
        WHEN unique_violation THEN RAISE EXCEPTION 'course already exists';
    END;

    INSERT INTO audit_logs
        (authn_user_id, table_name,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, 'pl_courses',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
