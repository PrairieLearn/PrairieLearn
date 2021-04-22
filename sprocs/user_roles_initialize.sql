DROP FUNCTION IF EXISTS user_roles_initialize(bigint,bigint,enum_pogil_role);
CREATE OR REPLACE FUNCTION
    user_roles_initialize (
        arg_group_id bigint,
        arg_user_id bigint,
        arg_pogil_role enum_pogil_role,
    ) RETURNS void
AS $$
BEGIN
    -- TODO: add checks
    INSERT INTO user_roles (group_id, pogil_role, user_id) VALUES (arg_group_id, arg_pogil_role, arg_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
