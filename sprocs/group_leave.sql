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
    arg_assignee_old_role_id bigint;
    arg_group_role_id bigint;
    arg_has_roles boolean;
    arg_required_roles_count bigint;
    arg_cur_size bigint;
    arg_has_required_role boolean;
    arg_is_required_role boolean;
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

    -- Handle role reassignment if using group roles
    SELECT gc.has_roles INTO arg_has_roles
    FROM group_configs AS gc
    WHERE gc.assessment_id = arg_assessment_id AND gc.deleted_at IS NULL;

    IF arg_has_roles THEN
        -- Get current group size
        SELECT COUNT(DISTINCT user_id)
        INTO arg_cur_size
        FROM group_users
        WHERE group_id = arg_group_id;

        -- Get the number of required roles
        SELECT COUNT(*) INTO arg_required_roles_count
        FROM group_roles AS gr
        WHERE gr.assessment_id = arg_assessment_id AND gr.minimum > 0;

        IF arg_cur_size <= arg_required_roles_count AND arg_cur_size > 1 THEN
            -- When group_size (pre-leave) <= num_required roles:

            -- 1. Grab a random other user from the group
            SELECT user_id
            INTO arg_assignee_id
            FROM group_users
            WHERE group_id = arg_group_id AND user_id != arg_user_id
            LIMIT 1;

            -- 2. Give them all of the leaving user's roles
            FOR arg_group_role_id IN
                SELECT gu.group_role_id
                FROM group_user_roles gu
                WHERE gu.group_id = arg_group_id AND gu.user_id = arg_user_id
            LOOP
                INSERT INTO group_user_roles (group_id, user_id, group_role_id)
                VALUES (arg_group_id, arg_assignee_id, arg_group_role_id)
                ON CONFLICT (group_id, user_id, group_role_id) DO NOTHING;
            END LOOP;
        ELSIF arg_cur_size > 1 THEN
            -- When group_size (pre-leave) > num_required roles:

            -- Iterate through all the user's roles
            FOR arg_group_role_id, arg_is_required_role IN
                SELECT gu.group_role_id, gr.minimum > 0
                FROM group_user_roles gu JOIN group_roles gr ON gu.group_role_id = gr.id
                WHERE gu.group_id = arg_group_id AND gu.user_id = arg_user_id
            LOOP
                -- If a given role is required, then:
                IF arg_is_required_role THEN
                    -- Try to find someone with a non-required role to replace
                    SELECT gu.user_id, gu.group_role_id
                    INTO arg_assignee_id, arg_assignee_old_role_id
                    FROM group_user_roles gu LEFT JOIN group_roles gr ON gu.group_role_id = gr.id
                    WHERE group_id = arg_group_id AND user_id != arg_user_id AND gr.minimum = 0
                    LIMIT 1;

                    -- If we find someone with a non-required role, replace that role with the leaving user's role
                    IF FOUND THEN
                        UPDATE group_user_roles
                        SET group_role_id = arg_group_role_id
                        WHERE group_id = arg_group_id AND user_id = arg_assignee_id AND group_role_id = arg_assignee_old_role_id;
                    ELSE
                        -- Otherwise, just give the leaving user's role to someone else randomly
                        SELECT user_id
                        INTO arg_assignee_id
                        FROM group_user_roles
                        WHERE group_id = arg_group_id AND user_id != arg_user_id
                        LIMIT 1;

                        INSERT INTO group_user_roles (group_id, user_id, group_role_id)
                        VALUES (arg_group_id, arg_assignee_id, arg_group_role_id)
                        ON CONFLICT (group_id, user_id, group_role_id) DO NOTHING;
                        END IF;
                END IF;
            END LOOP;

            -- Make sure no users are left with non-required roles
            DELETE FROM group_user_roles gur
            WHERE group_id = arg_group_id AND group_role_id IN (
                SELECT id
                FROM group_roles
                WHERE assessment_id = arg_assessment_id AND minimum = 0
            );
        END IF;
    END IF;

    -- TODO: If someone has no roles, and another person has more than one required role, transfer one of the required roles

    -- Delete the user from the group
    DELETE FROM group_users
    WHERE user_id = arg_user_id AND group_id = arg_group_id;

    DELETE FROM group_user_roles
    WHERE user_id = arg_user_id AND group_id = arg_group_id;

    -- Update logs
    INSERT INTO group_logs (authn_user_id, user_id, group_id, action)
    VALUES (arg_authn_user_id, arg_user_id, arg_group_id, 'leave');
END;
$$ LANGUAGE plpgsql VOLATILE;
