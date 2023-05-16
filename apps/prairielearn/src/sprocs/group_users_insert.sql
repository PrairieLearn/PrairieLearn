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
    cur_group_id bigint;
    cur_size bigint;
    max_size bigint;
    has_roles boolean;
    default_group_role_id bigint;
    min_roles_to_fill bigint;
BEGIN
    -- find group id
    SELECT 
        g.id
    INTO 
        cur_group_id
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
    WHERE g.id = cur_group_id
    FOR NO KEY UPDATE OF g;

    -- count the group size and compare with the max size
    SELECT
        COUNT(DISTINCT gu.user_id), AVG(gc.maximum)
    INTO
        cur_size, max_size
    FROM
        groups g
        JOIN group_configs AS gc ON g.group_config_id = gc.id
        LEFT JOIN group_users AS gu ON gu.group_id = g.id
    WHERE
        g.id = cur_group_id
    GROUP BY
        g.id;

    IF cur_size >= max_size THEN
        RAISE EXCEPTION 'The group is full for join code: %', arg_join_code;
    END IF;

    -- find whether assessment is using group roles
    SELECT gc.has_roles INTO has_roles
    FROM group_configs AS gc
    WHERE gc.assessment_id = arg_assessment_id AND gc.deleted_at IS NULL;

    -- find the default group role id
    IF has_roles THEN
        -- if groupsize == 0, give an assigner role
        -- else if groupsize <= (minimum roles to fill), assign the user a random role where (min > 0)
        -- else, assign a role with the highest maximum
        
        SELECT SUM(gr.minimum) INTO min_roles_to_fill
        FROM group_roles AS gr
        WHERE gr.assessment_id = arg_assessment_id;

        IF cur_size = 0 THEN
            SELECT id INTO default_group_role_id
            FROM group_roles AS gr
            WHERE gr.assessment_id = arg_assessment_id AND gr.can_assign_roles_at_start
            LIMIT 1;
        ELSIF cur_size < min_roles_to_fill THEN
            SELECT id INTO default_group_role_id
            FROM group_roles AS gr
            WHERE gr.assessment_id = arg_assessment_id AND gr.minimum > 0 AND NOT gr.can_assign_roles_at_start
            LIMIT 1;
        ELSE
            SELECT id INTO default_group_role_id
            FROM group_roles AS gr
            WHERE gr.assessment_id = arg_assessment_id
            ORDER BY gr.maximum DESC
            LIMIT 1;
        END IF;
    END IF;

    -- join the group
    INSERT INTO group_users (user_id, group_id)
    VALUES (arg_user_id, cur_group_id);

    -- assign the role, if appropriate
    IF has_roles THEN
        INSERT INTO group_user_roles
            (user_id, group_id, group_role_id)
        VALUES
            (arg_user_id, cur_group_id, default_group_role_id);
    END IF;

    -- log the join
    INSERT INTO group_logs
        (authn_user_id, user_id, group_id, action)
    VALUES
        (arg_authn_user_id, arg_user_id, cur_group_id, 'join');
END;
$$ LANGUAGE plpgsql VOLATILE;
