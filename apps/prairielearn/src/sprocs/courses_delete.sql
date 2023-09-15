CREATE FUNCTION
    courses_delete(
        course_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    new_row pl_courses%ROWTYPE;
BEGIN
    UPDATE pl_courses AS c
    SET
        deleted_at = current_timestamp
    WHERE
        c.id = course_id
    RETURNING
        c.* INTO new_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course';
    END IF;

    INSERT INTO audit_logs
        (authn_user_id,  table_name,
        row_id,      action,       new_state)
    VALUES
        (authn_user_id, 'pl_courses',
        new_row.id, 'soft_delete', to_jsonb(new_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
