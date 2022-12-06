CREATE FUNCTION
    group_roles_update (
        arg_assessment_id bigint,
        role_updates JSONB[],
        arg_user_id bigint,
        arg_authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    arg_group_id bigint;
    arg_group_user_id bigint;
    arg_default_group_role_id bigint;
    arg_role_update JSONB;
    arg_group_role_id JSONB;
    arg_assigner_role_id bigint;
BEGIN
    -- Find group id
    SELECT DISTINCT group_id
    INTO arg_group_id
    FROM group_users as gu 
    JOIN groups as g ON gu.group_id = g.id
    JOIN group_configs as gc ON g.group_config_id = gc.id
    WHERE user_id = arg_user_id
    AND gc.assessment_id = arg_assessment_id
    AND g.deleted_at IS NULL
    AND gc.deleted_at IS NULL;

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
    -- DELETE FROM group_users WHERE group_id = arg_group_id;

    -- -- Assign every saved group user a "default" role
    -- SELECT id INTO arg_default_group_role_id
    -- FROM group_roles AS gr
    -- WHERE gr.assessment_id = arg_assessment_id
    -- ORDER BY gr.maximum DESC
    -- LIMIT 1;

    -- INSERT INTO group_users (group_id, user_id, group_role_id)
    -- SELECT cgu.group_id, cgu.user_id, arg_default_group_role_id
    -- FROM current_group_users cgu;

    -- Assign each user's role
    FOREACH arg_role_update IN ARRAY role_updates LOOP
        DELETE FROM group_users WHERE user_id = (arg_role_update->>'user_id')::bigint AND group_id = arg_group_id;

        -- Update roles of user
        FOR arg_group_role_id IN SELECT * FROM JSONB_ARRAY_ELEMENTS(arg_role_update->'group_role_ids') LOOP
            INSERT INTO group_users (group_id, user_id, group_role_id)
            VALUES (
                arg_group_id, 
                (arg_role_update->>'user_id')::bigint,
                arg_group_role_id::text::bigint
            );
        END LOOP;
    END LOOP;

    -- See if anyone has the assigner role
    -- If not, give it to somebody
    IF (
        SELECT COUNT(*)
        FROM group_users as gu LEFT JOIN group_roles as gr ON gr.id = gu.group_role_id
        WHERE gr.can_assign_roles_at_start AND gr.can_assign_roles_during_assessment
    ) = 0
    THEN
        -- Get the role_id of the assigner role
        SELECT id
        INTO arg_assigner_role_id
        FROM group_roles
        WHERE assessment_id = arg_assessment_id AND (can_assign_roles_at_start AND can_assign_roles_during_assessment);

        -- Give the assigner role to the user who performed the update
        INSERT INTO group_users (group_id, user_id, group_role_id)
        VALUES (
            arg_group_id,
            arg_user_id,
            arg_assigner_role_id
        );
    END IF;

    -- Log the update 
    INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
    VALUES
        (arg_authn_user_id, arg_user_id, arg_group_id, 'update roles');
END;
$$ LANGUAGE plpgsql VOLATILE;
