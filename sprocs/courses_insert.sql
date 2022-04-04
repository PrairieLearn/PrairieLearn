CREATE FUNCTION
    courses_insert(
        IN institution_id bigint,
        IN short_name text,
        IN title text,
        IN display_timezone text,
        IN path text,
        IN repository text,
        IN branch text,
        IN authn_user_id bigint,
        OUT new_row pl_courses
    )
AS $$
BEGIN
    BEGIN
        INSERT INTO pl_courses AS c
            (short_name, title, display_timezone, path, repository, branch, institution_id)
        VALUES
            (short_name, title, display_timezone, path, repository, branch, institution_id)
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
