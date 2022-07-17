CREATE FUNCTION
    group_roles_update (
        arg_assessment_id bigint,
        role_updates JSONB[]
    ) RETURNS void
AS $$
DECLARE
    arg_group_id bigint;
    arg_group_user_id bigint;
    arg_default_group_role_id bigint;
    arg_role_update JSONB;
    arg_group_role_id JSONB;
BEGIN
    -- Find group id
    SELECT 
        g.id
    INTO 
        arg_group_id
    FROM 
        groups AS g
        JOIN group_configs AS gc ON g.group_config_id = gc.id
    WHERE 
        gc.assessment_id = arg_assessment_id
        AND g.deleted_at IS NULL
        AND gc.deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot find the group by provided join code: %', arg_join_code;
    END IF;

    -- Save all group user IDs
    CREATE TEMPORARY TABLE current_group_users (
        group_id bigint,
        user_id bigint
    ) ON COMMIT DROP; 
    INSERT INTO current_group_users
    SELECT DISTINCT gu.group_id, gu.user_id
    FROM group_users gu
    WHERE gu.group_id = arg_group_id;

    -- Clear the group's role assignments
    DELETE FROM group_users WHERE group_id = arg_group_id;

    -- Assign every saved group user a "default" role
    SELECT id INTO arg_default_group_role_id
    FROM group_roles AS gr
    WHERE gr.assessment_id = arg_assessment_id
    ORDER BY gr.maximum DESC
    LIMIT 1;

    INSERT INTO group_users (group_id, user_id, group_role_id)
    SELECT cgu.group_id, cgu.user_id, arg_default_group_role_id
    FROM current_group_users cgu;

    -- Assign each user's role
    FOREACH arg_role_update IN ARRAY role_updates LOOP
        -- Find user by uid
        SELECT u.user_id
        INTO arg_group_user_id
        FROM users as u
        WHERE u.uid = (arg_role_update->>'uid')::text;

        DELETE FROM group_users WHERE user_id = arg_group_user_id;

        -- Update roles of user
        FOR arg_group_role_id IN SELECT * FROM JSONB_ARRAY_ELEMENTS(arg_role_update->'group_role_ids') LOOP
            INSERT INTO group_users (group_id, user_id, group_role_id)
            VALUES (
                arg_group_id, 
                arg_group_user_id,
                arg_group_role_id::text::bigint
            );
        END LOOP;
    END LOOP;

    -- TODO: log
END;
$$ LANGUAGE plpgsql VOLATILE;
