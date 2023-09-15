CREATE FUNCTION
    administrators_delete_by_user_id(
        user_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row administrators%ROWTYPE;
BEGIN
    DELETE FROM administrators AS adm
    WHERE
        adm.user_id = administrators_delete_by_user_id.user_id
    RETURNING
        adm.* INTO old_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find user';
    END IF;

    INSERT INTO audit_logs
        (authn_user_id, user_id,  table_name,
        row_id,      action,  old_state)
    VALUES
        (authn_user_id, user_id, 'administrators',
        old_row.id, 'delete', to_jsonb(old_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
