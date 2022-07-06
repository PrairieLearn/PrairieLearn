CREATE FUNCTION
    group_roles_update (
        arg_assessment_id bigint,
        arg_user_id bigint,
        role_updates JSONB[]
    ) RETURNS void
AS $$
DECLARE
    arg_group_id bigint;
    arg_user_id bigint;
    role_update JSONB;
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

    -- Update all group users to have no roles
    UPDATE group_users
    SET group_role_id = NULL
    WHERE group_id = arg_group_id;

    FOR role_update IN SELECT * FROM JSONB_ARRAY_ELEMENTS(role_updates) LOOP
        -- Find user by uid
        SELECT u.user_id
        INTO arg_user_id
        FROM users as u
        WHERE u.uid = (role_update->'uid')::text;

        -- Update role of user
        -- FIXME: later, we will have to update on multiple roles
        UPDATE group_users
        SET group_role_id = (role_update->'group_role_id')::bigint
        WHERE user_id = arg_user_id;
    END LOOP;

    -- TODO: log
END;
$$ LANGUAGE plpgsql VOLATILE;
