DROP FUNCTION IF EXISTS user_roles_update(bigint,bigint,enum_pogil_role,enum_pogil_role);
CREATE OR REPLACE FUNCTION
    user_roles_update (
        arg_group_id bigint,
        arg_user_id bigint,
        arg_pogil_role_old enum_pogil_role,
        arg_pogil_role_new enum_pogil_role,
    ) RETURNS void
AS $$
BEGIN
    -- TODO: if another user in group has requested role, raise exception
    -- TODO: if old role for user doesn't exist, raise exception
    -- TODO: if user is Manager and tries to replace Manager, transaction?

    UPDATE
        user_roles as ur
    SET
        pogil_role = arg_pogil_role_new
    WHERE
        ur.user_id = arg_user_id
        AND ur.group_id = arg_group_id
        AND ur.pogil_role = arg_pogil_role_old;
END;
$$ LANGUAGE plpgsql VOLATILE;
