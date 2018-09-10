CREATE OR REPLACE FUNCTION
    access_tokens_delete(
        id bigint,
        user_id bigint
    ) returns void
AS $$
DECLARE
    old_row access_tokens%ROWTYPE;
BEGIN
    DELETE FROM access_tokens AS a
    WHERE
        a.user_id = access_tokens_delete.user_id
        AND a.id = access_tokens_delete.id
    RETURNING
        a.* INTO old_row;

    INSERT INTO audit_logs
        (authn_user_id, user_id, table_name,
        row_id,     action,   old_state)
    VALUES
        (user_id,       user_id, 'access_tokens',
        old_row.id, 'delete', to_jsonb(old_row) - 'token');
END;
$$ LANGUAGE plpgsql VOLATILE;
