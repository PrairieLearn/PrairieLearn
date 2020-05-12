CREATE OR REPLACE FUNCTION
    assessment_groups_update(
        IN arg_assessment_id bigint,          -- must provide assessment_id
        IN arg_groupname text,
        IN arg_uid text
    ) RETURNS void
AS $$
DECLARE
    arg_user_id bigint;
    arg_course_instance_id bigint;
    arg_group_config_id bigint;
    arg_group_id bigint;
BEGIN
    -- ##################################################################
    -- get group_config_id and course_instance_id from assessment_id
    SELECT id, course_instance_id
    INTO arg_group_config_id, arg_course_instance_id
    FROM group_configs
    WHERE assessment_id = arg_assessment_id;

    -- ##################################################################
    -- insert groups if not exist
    IF NOT EXISTS (SELECT 1 FROM groups WHERE name = arg_groupname AND group_config_id = arg_group_config_id) THEN
        INSERT INTO groups (name, group_config_id, course_instance_id)
        VALUES (arg_groupname, arg_group_config_id, arg_course_instance_id);
    END IF;

    -- ##################################################################
    -- get user_id from uid
    SELECT user_id
    INTO arg_user_id
    FROM users
    WHERE uid = arg_uid;

    -- ##################################################################
    -- get group_id from groupname and group_type_id
    SELECT id
    INTO arg_group_id
    FROM groups
    WHERE name = arg_groupname AND group_config_id = arg_group_config_id;

    -- ##################################################################
    -- insert group_user
    INSERT INTO group_users (group_id, user_id)
    VALUES (arg_group_id, arg_user_id);
    
END;
$$ LANGUAGE plpgsql VOLATILE;
