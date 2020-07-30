CREATE OR REPLACE FUNCTION
    assessment_groups_copy(
        assessment_id bigint,
        copying_assessment_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    temp_old_group_config_id BIGINT;
    temp_copy_group_config_id BIGINT;
    temp_new_group_config_id BIGINT;
    temp_copy_group_id BIGINT;
    temp_new_group_id BIGINT;
BEGIN
    -- ##################################################################
    -- get a copying group_config
    SELECT id INTO temp_copy_group_config_id
    FROM group_configs gc
    WHERE gc.assessment_id = assessment_groups_copy.copying_assessment_id AND gc.deleted_at IS NULL;

    -- soft delete the old group config
    UPDATE group_configs gc
    SET deleted_at = NOW()
    WHERE gc.assessment_id = assessment_groups_copy.assessment_id AND gc.deleted_at IS NULL
    RETURNING id INTO temp_old_group_config_id;

    -- soft delete the old groups
    UPDATE groups gr
    SET deleted_at = NOW()
    WHERE gr.group_config_id = temp_old_group_config_id;

    INSERT INTO group_logs 
        (authn_user_id, group_id, action)
    VALUES 
        (assessment_groups_copy.authn_user_id, temp_old_group_config_id, 'delete');

    -- add a new group config
    INSERT INTO group_configs(assessment_id, course_instance_id, name, minimum, maximum, student_authz_join, student_authz_create, student_authz_leave)
    SELECT @assessment_groups_copy.assessment_id, course_instance_id, name, minimum, maximum, student_authz_join, student_authz_create, student_authz_leave
    FROM group_configs gc
    WHERE gc.assessment_id = assessment_groups_copy.copying_assessment_id AND gc.deleted_at IS NULL
    RETURNING id INTO temp_new_group_config_id;

    -- ##################################################################
    -- for loop to traverse all groups in copying_assessment_id and copy rows in groups and group_users
    FOR temp_copy_group_id IN (SELECT id FROM groups gr where gr.group_config_id = temp_copy_group_config_id AND gr.deleted_at IS NULL) LOOP
        -- insert a group
        INSERT INTO groups(group_config_id, course_instance_id, name)
        SELECT temp_new_group_config_id, course_instance_id, name
        FROM groups gr
        WHERE gr.id = temp_copy_group_id AND gr.deleted_at IS NULL
        RETURNING id INTO temp_new_group_id;
        
        INSERT INTO group_logs 
            (authn_user_id, user_id, group_id, action)
        VALUES (assessment_groups_copy.authn_user_id, assessment_groups_copy.authn_user_id, temp_new_group_id, 'create');

        -- insert group members
        WITH log AS (
            INSERT INTO group_users
                (group_id, user_id)
            SELECT temp_new_group_id, user_id
            FROM group_users gu
            WHERE gu.group_id = temp_copy_group_id
            RETURNING user_id
        )
        INSERT INTO group_logs 
            (authn_user_id, user_id, group_id, action)
        SELECT 
            assessment_groups_copy.authn_user_id, user_id, temp_new_group_id, 'join'
        FROM
            log;

    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
