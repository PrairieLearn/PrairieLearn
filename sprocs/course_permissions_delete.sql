CREATE FUNCTION
    course_permissions_delete(
        course_id bigint,
        user_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row course_permissions%ROWTYPE;
BEGIN
    DELETE FROM course_permissions AS cp
    WHERE
        cp.course_id = course_permissions_delete.course_id
        AND cp.user_id = course_permissions_delete.user_id
    RETURNING
        cp.* INTO old_row;
        
    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course_permission';
    END IF;

    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id,  table_name,          row_id,
        action,  old_state)
    VALUES
        (authn_user_id, course_id, user_id, 'course_permissions', old_row.id,
        'delete', to_jsonb(old_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
