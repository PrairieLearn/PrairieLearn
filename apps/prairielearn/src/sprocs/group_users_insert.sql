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
    FOR NO KEY UPDATE OF g;

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

    -- join the group
    INSERT INTO group_users
        (user_id, group_id)
    VALUES
        (arg_user_id, arg_group_id);

    INSERT INTO group_logs
        (authn_user_id, user_id, group_id, action)
    VALUES
        (arg_authn_user_id, arg_user_id, arg_group_id, 'join');

    -- log the join
    INSERT INTO group_logs
    (authn_user_id, user_id, group_id, action)
    VALUES
        (arg_authn_user_id, arg_user_id, arg_group_id, 'join');
END;
$$ LANGUAGE plpgsql VOLATILE;
