CREATE OR REPLACE FUNCTION
    course_permissions_delete_user(
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
        cp.course_id = course_permissions_delete_user.course_id
        AND cp.user_id = course_permissions_delete_user.user_id
    RETURNING
        cp.* INTO old_row;
        
    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id, tablename,
        row_id,      action,  old_state)
    VALUES
        (authn_user_id, course_id, user_id, 'course_permissions',
        old_row.id, 'delete', to_jsonb(old_row));
END;
$$ LANGUAGE plpgsql VOLATILE;
