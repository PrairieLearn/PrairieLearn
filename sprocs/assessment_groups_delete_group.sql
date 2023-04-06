CREATE FUNCTION
    assessment_groups_delete_group(
        assessment_id bigint,
        arg_group_id bigint,
        authn_user_id bigint
    ) RETURNS void
AS $$
BEGIN
    -- ##################################################################
    -- verify the group that will be deleted does in fact below to the selected assessment
    -- then lock the group row
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
