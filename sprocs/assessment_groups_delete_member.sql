CREATE OR REPLACE FUNCTION
    assessment_groups_delete_member(
        assessment_id bigint,
        arg_gid bigint,
        arg_uid text,
        authn_user_id bigint
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
    -- remove group_user
    DELETE FROM group_users
    WHERE group_id = arg_gid AND user_id = arg_user_id;

    INSERT INTO group_logs 
        (authn_user_id, user_id, group_id, action)
    VALUES 
        (assessment_groups_delete_member.authn_user_id, arg_user_id, arg_gid, 'leave');

END;
$$ LANGUAGE plpgsql VOLATILE;
