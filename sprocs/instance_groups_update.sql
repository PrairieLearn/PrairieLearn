DROP FUNCTION IF EXISTS instance_groups_update(bigint,text, text);

CREATE OR REPLACE FUNCTION
    instance_groups_update(
        IN arg_assessment_id bigint,          -- must provide assessment_id
        IN arg_groupname text,
        IN arg_uid text
    ) RETURNS void
AS $$
DECLARE
    arg_user_id bigint;
    arg_group_type_id bigint;
    arg_group_id bigint;
BEGIN
    -- ##################################################################
    -- get group_type_id from assessment_id
    SELECT id
    INTO arg_group_type_id
    FROM group_type
    WHERE assessment_id = arg_assessment_id;

    -- ##################################################################
    -- insert groups if not exist
    IF NOT EXISTS (SELECT 1 FROM groups WHERE group_name = arg_groupname AND group_type_id = arg_group_type_id) THEN
        INSERT INTO groups (group_name, group_type_id)
        VALUES (arg_groupname, arg_group_type_id);
    END IF;

    -- ##################################################################
    -- get user_id from uid
    SELECT user_id
    INTO arg_user_id
    FROM users
    WHERE uid = arg_uid;

    -- ##################################################################
    -- get group_id from groupname and group_type_id
    SELECT id
    INTO arg_group_id
    FROM groups
    WHERE group_name = arg_groupname AND group_type_id = arg_group_type_id;

    -- ##################################################################
    -- insert group_user
    INSERT INTO group_user (group_id, user_id)
    VALUES (arg_group_id, arg_user_id);
    
END;
$$ LANGUAGE plpgsql VOLATILE;
