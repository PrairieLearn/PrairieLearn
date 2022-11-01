CREATE FUNCTION
    group_leave (
        arg_assessment_id bigint,
        arg_user_id bigint,
        arg_authn_user_id bigint
    ) RETURNS void
AS $$
DECLARE
    arg_group_id bigint;
    arg_assignee_id bigint;
    arg_group_role_id bigint;
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
    
    -- If the assignment uses group roles with group size > 1:
    -- Grab a random other user from the group
    -- Give them the leaving user's roles
    IF (
        SELECT using_group_roles
        FROM group_configs
        WHERE assessment_id = arg_assessment_id
    ) AND (
        SELECT count(DISTINCT user_id) > 1
        FROM group_users
        WHERE group_id = arg_group_id
    )
    THEN
        SELECT user_id
        INTO arg_assignee_id
        FROM group_users
        WHERE group_id = arg_group_id AND user_id != arg_user_id
        LIMIT 1;

        FOR arg_group_role_id IN
            SELECT gu.group_role_id
            FROM group_users gu
            WHERE gu.group_id = arg_group_id AND gu.user_id = arg_user_id
        LOOP
            INSERT INTO group_users (group_id, user_id, group_role_id)
            VALUES (arg_group_id, arg_assignee_id, arg_group_role_id);
        END LOOP;
    END IF;

    -- Delete the user from the group
    DELETE FROM group_users
    WHERE user_id = arg_user_id AND group_id = arg_group_id;

    -- Update logs
    INSERT INTO group_logs (authn_user_id, user_id, group_id, action)
    VALUES (arg_authn_user_id, arg_user_id, arg_group_id, 'leave');
END;
$$ LANGUAGE plpgsql VOLATILE;
