DROP FUNCTION IF EXISTS group_users_insert(bigint,bigint,bigint,text,text);
CREATE OR REPLACE FUNCTION
    update_group_pogil_role (
        arg_group_role text, -- This is the new POGIL role!
        arg_user_id bigint,
        arg_group_id bigint
    ) RETURNS void
AS $$
BEGIN
    -- update the user's pogil role
    UPDATE
        group_users as gu
    SET
        pogil_role = arg_group_role
    WHERE
        gu.user_id = arg_user_id
        AND gu.group_id = arg_group_id;
END;
$$ LANGUAGE plpgsql VOLATILE;