CREATE FUNCTION
    assessment_groups_update(
        IN arg_assessment_id bigint,
        IN update_list text[][], -- [[groupName1, uid1], [groupName2, uid2], ...]
        IN authn_user_id bigint,
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
        -- get user_id from uid
        -- make sure this user is enrolled in the course instance
        SELECT u.user_id
        INTO arg_user_id
        FROM users AS u
        JOIN enrollments AS e ON e.user_id = u.user_id
        JOIN assessments AS a ON a.course_instance_id = e.course_instance_id AND a.id = arg_assessment_id
        WHERE u.uid = group_user[2];
        -- make sure this user does not belong to another group in the same assessment
        IF EXISTS (
                    SELECT 1
                    FROM group_users AS gu
                    JOIN groups AS g ON gu.group_id = g.id
                    WHERE gu.user_id = arg_user_id
                    AND g.group_config_id = arg_group_config_id
                    AND g.deleted_at IS NULL
                  ) THEN
            SELECT array_append(already_in_group, group_user[2])
            INTO already_in_group;
            CONTINUE;
        END IF;
        
        -- insert groups if not exist
        IF NOT EXISTS (SELECT 1 FROM groups WHERE name = group_user[1] AND group_config_id = arg_group_config_id AND deleted_at IS NULL) THEN
            WITH log AS (
                INSERT INTO groups (name, group_config_id, course_instance_id)
                VALUES (group_user[1], arg_group_config_id, arg_course_instance_id)
                RETURNING id
            )
            INSERT INTO group_logs 
                (authn_user_id, user_id, group_id, action)
            SELECT 
                assessment_groups_update.authn_user_id, assessment_groups_update.authn_user_id, id, 'create'
            FROM
                log;
        END IF;
        -- get group_id from groupname
        SELECT id
        INTO arg_group_id
        FROM groups
        WHERE name = group_user[1] AND group_config_id = arg_group_config_id AND deleted_at IS NULL;
        -- insert group_user
        INSERT INTO group_users (group_id, user_id)
        VALUES (arg_group_id, arg_user_id);

        INSERT INTO group_logs 
            (authn_user_id, user_id, group_id, action)
        VALUES 
            (assessment_groups_update.authn_user_id, arg_user_id, arg_group_id, 'join');
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
