CREATE OR REPLACE FUNCTION
    access_tokens_insert(
        user_id bigint,
        name text,
        token text,
        token_hash text
    ) returns void
AS $$
DECLARE
    new_row access_tokens%ROWTYPE;
BEGIN
    INSERT INTO access_tokens AS a
        (name, user_id, token, token_hash)
    VALUES
        (name, user_id, token, token_hash)
    RETURNING
        a.* INTO new_row;

    INSERT INTO audit_logs
        (user_id, authn_user_id, table_name,
        row_id,     action,   new_state)
    VALUES
        (user_id, user_id,       'access_tokens',
        new_row.id, 'insert', to_jsonb(new_row) - 'token');
END;
$$ LANGUAGE plpgsql VOLATILE;
