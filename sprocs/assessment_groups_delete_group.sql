CREATE OR REPLACE FUNCTION
    assessment_groups_delete_group(
        assessment_id bigint,
        arg_group_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
BEGIN
    -- ##################################################################
    -- soft delete a group
    UPDATE groups
    SET deleted_at = NOW()
    WHERE id = arg_group_id;

    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    VALUES 
        (assessment_groups_delete_group.authn_user_id, arg_group_id, 'delete');


END;
$$ LANGUAGE plpgsql VOLATILE;
