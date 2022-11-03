CREATE FUNCTION
    group_users_insert (
        arg_assessment_id bigint,
        arg_user_id bigint,
        arg_authn_user_id bigint,
        arg_group_name text,
        arg_join_code text
    ) RETURNS void
AS $$
DECLARE
    arg_group_id bigint;
    arg_cur_size bigint;
    arg_max_size bigint;
    arg_using_group_roles boolean;
    arg_default_group_role_id bigint;
BEGIN
    -- find group id
    SELECT 
        g.id
    INTO 
        arg_group_id
    FROM 
        groups AS g
        JOIN group_configs AS gc ON g.group_config_id = gc.id
    WHERE 
        g.name = arg_group_name 
        AND g.join_code = arg_join_code
        AND gc.assessment_id = arg_assessment_id
        AND g.deleted_at IS NULL
        AND gc.deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot find the group by provided join code: %', arg_join_code;
    END IF;

    -- lock the group
    -- to prevent many students join a group together breaking max size of the group
    PERFORM g.id
    FROM groups AS g
    WHERE g.id = arg_group_id
    FOR UPDATE OF g;

    -- count the group size and compare with the max size
    SELECT
        COUNT(gu), AVG(gc.maximum)
    INTO
        arg_cur_size, arg_max_size
    FROM
        groups g
        JOIN group_configs AS gc ON g.group_config_id = gc.id
        LEFT JOIN group_users AS gu ON gu.group_id = g.id
    WHERE
        g.id = arg_group_id
    GROUP BY
        g.id;

    IF arg_cur_size >= arg_max_size THEN
        RAISE EXCEPTION 'The group is full for join code: %', arg_join_code;
    END IF;

    -- find whether assessment is using group roles
    SELECT gc.using_group_roles INTO arg_using_group_roles
    FROM group_configs AS gc
    WHERE gc.assessment_id = arg_assessment_id AND gc.deleted_at IS NULL;

    -- find the default group role id
    IF arg_using_group_roles THEN
        -- if no users are present in group, allow first user to assign roles
        IF arg_cur_size = 0 THEN
            SELECT id INTO arg_default_group_role_id
            FROM group_roles AS gr
            WHERE gr.assessment_id = arg_assessment_id AND gr.can_assign_roles_at_start
            LIMIT 1;
        ELSE
            SELECT id INTO arg_default_group_role_id
            FROM group_roles AS gr
            WHERE gr.assessment_id = arg_assessment_id
            ORDER BY gr.maximum DESC
            LIMIT 1;
        END IF;
    ELSE
        SELECT id INTO arg_default_group_role_id
        FROM group_roles AS gr
        WHERE gr.role_name = 'No group roles'
        LIMIT 1;
    END IF;

    -- join the group
    INSERT INTO group_users
        (user_id, group_id, group_role_id)
    VALUES
        (arg_user_id, arg_group_id, arg_default_group_role_id);

    -- log the join
    INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
    VALUES
        (arg_authn_user_id, arg_user_id, arg_group_id, 'join');
END;
$$ LANGUAGE plpgsql VOLATILE;
