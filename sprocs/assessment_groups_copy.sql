CREATE OR REPLACE FUNCTION
    assessment_groups_copy(
        assessment_id bigint,
        copying_assessment_id bigint
    ) returns void
AS $$
DECLARE
    temp_old_group_config_id BIGINT;
    temp_new_group_config_id BIGINT;
    temp_old_group_id BIGINT;
    temp_new_group_id BIGINT;
BEGIN
    -- ##################################################################
    -- get a old group_config
    SELECT id INTO temp_old_group_config_id
    FROM group_configs gc
    WHERE gc.assessment_id = copying_assessment_id AND gc.deleted_at IS NULL;

    -- ##################################################################
    -- delete old and create a new group_config
    UPDATE group_configs gc
    SET deleted_at = NOW()
    WHERE gc.assessment_id = assessment_groups_copy.assessment_id AND gc.deleted_at IS NULL;

    INSERT INTO group_configs(assessment_id, course_instance_id, type, name, minimum, maximum)
    SELECT assessment_groups_copy.assessment_id, course_instance_id, type, name, minimum, maximum
    FROM group_configs gc
    WHERE gc.assessment_id = assessment_groups_copy.copying_assessment_id AND gc.deleted_at IS NULL
    RETURNING id INTO temp_new_group_config_id;

    -- ##################################################################
    -- for loop to traverse all groups in copying_assessment_id and copy rows in groups and group_users
    FOR temp_old_group_id IN (SELECT id FROM groups gr where gr.group_config_id = temp_old_group_config_id) LOOP
        INSERT INTO groups(group_config_id, course_instance_id, name)
        SELECT temp_new_group_config_id, course_instance_id, name
        FROM groups gr
        WHERE gr.id = temp_old_group_id AND gr.deleted_at IS NULL
        RETURNING id INTO temp_new_group_id;

        INSERT INTO group_users(group_id, user_id)
        SELECT temp_new_group_id, user_id
        FROM group_users gu
        WHERE gu.group_id = temp_old_group_id;
    END LOOP;

END;
$$ LANGUAGE plpgsql VOLATILE;
