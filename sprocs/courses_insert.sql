CREATE OR REPLACE FUNCTION
    courses_insert(
        short_name text,
        title text,
        path text,
        repository text,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    new_row courses%ROWTYPE;
BEGIN
    BEGIN
        INSERT INTO courses AS c
            (short_name, title, path, repository)
        VALUES
            (short_name, title, path, repository)
        RETURNING
            c.* INTO new_row;
    EXCEPTION
        WHEN unique_violation THEN RAISE EXCEPTION 'course already exists';
    END;

    INSERT INTO audit_logs
        (authn_user_id, table_name,
        row_id,      action,  new_state)
    VALUES
        (authn_user_id, 'courses',
        new_row.id, 'insert', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
