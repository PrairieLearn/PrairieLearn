DROP FUNCTION IF EXISTS user_roles_update(bigint,bigint,enum_pogil_role);
CREATE OR REPLACE FUNCTION
    user_roles_update (
        arg_group_id bigint
        arg_user_id bigint,
        arg_pogil_role enum_pogil_role,
    ) RETURNS void
AS $$
BEGIN
    -- Update the user's pogil role
    UPDATE
        user_roles as ur
    SET
        pogil_role = arg_pogil_role
    WHERE
        ur.user_id = arg_user_id
        AND ur.group_id = arg_group_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
