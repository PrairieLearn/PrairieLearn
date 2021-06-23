DROP FUNCTION IF EXISTS user_roles_delete(bigint,bigint,enum_pogil_role);
CREATE OR REPLACE FUNCTION
    user_roles_delete (
        arg_group_id bigint,
        arg_user_id bigint,
        arg_pogil_role enum_pogil_role,
    ) RETURNS void
AS $$
BEGIN
    -- TODO: get user's role before deletion to move role to other user in group
    -- TODO: figure out what to do when user has multiple roles

    DELETE FROM
        user_roles
    WHERE
        group_id = arg_group_id AND user_id = arg_user_id;

    -- TODO: if user was Manager, move Manager role to other member
    -- TODO: insert deleted user's roles with other users in group 
END;
$$ LANGUAGE plpgsql VOLATILE;
