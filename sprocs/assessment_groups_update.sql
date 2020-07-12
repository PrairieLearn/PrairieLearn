CREATE OR REPLACE FUNCTION
    assessment_groups_update(
        IN arg_assessment_id bigint,
        IN update_list text[][], -- [[groupName1, uid1], [groupName2, uid2], ...]
        OUT not_exist_user text[],
        OUT already_in_group text[]
    )
AS $$
DECLARE
    arg_course_instance_id bigint;
    arg_group_config_id bigint;
    arg_user_id bigint;
    arg_group_id bigint;
    group_user text[];
BEGIN
    -- ##################################################################
    -- get group_config_id and course_instance_id from assessment_id
    SELECT id, course_instance_id
    INTO arg_group_config_id, arg_course_instance_id
    FROM group_configs
    WHERE assessment_id = arg_assessment_id AND deleted_at IS NULL;

    -- ##################################################################
    -- start update group info: traverse each groupName and uid in update_list
    FOREACH group_user SLICE 1 IN ARRAY update_list LOOP
        BEGIN
        -- insert groups if not exist
        IF NOT EXISTS (SELECT 1 FROM groups WHERE name = group_user[1] AND group_config_id = arg_group_config_id AND deleted_at IS NULL) THEN
            INSERT INTO groups (name, group_config_id, course_instance_id)
            VALUES (group_user[1], arg_group_config_id, arg_course_instance_id);
        END IF;
        -- get group_id from groupname
        SELECT id
        INTO arg_group_id
        FROM groups
        WHERE name = group_user[1] AND group_config_id = arg_group_config_id AND deleted_at IS NULL;
        -- get user_id from uid
        SELECT user_id
        INTO arg_user_id
        FROM users
        WHERE uid = group_user[2];
        -- insert group_user
        INSERT INTO group_users (group_id, user_id)
        VALUES (arg_group_id, arg_user_id);
        -- record violations
        EXCEPTION 
            WHEN unique_violation THEN
            SELECT array_append(already_in_group, group_user[2])
            INTO already_in_group;
            WHEN not_null_violation THEN
            SELECT array_append(not_exist_user, group_user[2])
            INTO not_exist_user;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
