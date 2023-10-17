CREATE FUNCTION
    assessment_groups_delete_group(
        assessment_id bigint,
        arg_group_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
BEGIN
    -- Verify the group that will be deleted does in fact belong to the
    -- selected assessment, then lock the group row.
    PERFORM 1
    FROM
        group_configs AS gc
        JOIN groups AS g ON gc.id = g.group_config_id
    WHERE
        gc.assessment_id = assessment_groups_delete_group.assessment_id
        AND g.id = arg_group_id
        AND g.deleted_at IS NULL
    FOR NO KEY UPDATE of g;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The user does not belong to the assessment';
    END IF;

    -- Delete all group users.
    WITH deleted_group_users AS (
        DELETE FROM group_users
        WHERE group_id = arg_group_id
        RETURNING user_id
    )
    INSERT INTO group_logs
        (authn_user_id, user_id, group_id, action)
    SELECT
        assessment_groups_delete_group.authn_user_id,
        user_id,
        arg_group_id,
        'leave'
    FROM
        deleted_group_users;

    -- Soft delete the group.
    UPDATE groups
    SET deleted_at = NOW()
    WHERE id = arg_group_id;

    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    VALUES 
        (assessment_groups_delete_group.authn_user_id, arg_group_id, 'delete');


END;
$$ LANGUAGE plpgsql VOLATILE;
