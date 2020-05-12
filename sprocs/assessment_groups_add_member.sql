CREATE OR REPLACE FUNCTION
    assessment_groups_add_member(
        assessment_id bigint,
        arg_gid bigint,
        arg_uid text
    ) RETURNS void
AS $$
DECLARE
    arg_user_id bigint;
BEGIN
    -- ##################################################################
    -- get user_id from uid
    SELECT user_id
    INTO arg_user_id
    FROM users
    WHERE uid = arg_uid;

    -- ##################################################################
    -- insert group_user
    INSERT INTO group_users (group_id, user_id)
    VALUES (arg_gid, arg_user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
