CREATE FUNCTION
    assessment_groups_delete_group(
        arg_assessment_id bigint,
        arg_group_id bigint,
        arg_authn_user_id bigint
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
        gc.assessment_id = arg_assessment_id
        AND g.id = arg_group_id
        AND g.deleted_at IS NULL
    FOR UPDATE of g;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'The user does not belong to the assessment';
    END IF;

    -- ##################################################################
    -- soft delete a group
    UPDATE groups
    SET deleted_at = NOW()
    WHERE id = arg_group_id;

    PERFORM
        assessment_instances_delete(ai.id, arg_authn_user_id)
    FROM
        assessment_instances ai
    WHERE
        ai.assessment_id = arg_assessment_id
        AND ai.group_id = arg_group_id
        AND ai.deleted_at IS NULL;

    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    VALUES 
        (arg_authn_user_id, arg_group_id, 'delete');


END;
$$ LANGUAGE plpgsql VOLATILE;
