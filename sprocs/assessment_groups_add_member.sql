CREATE OR REPLACE FUNCTION
    assessment_groups_add_member(
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
    -- get user_id from uid and make sure the user is enrolled in this course instance
    SELECT u.user_id
    INTO arg_user_id
    FROM 
        users AS u
        JOIN enrollments AS e ON e.user_id = u.user_id
        JOIN assessments AS a ON a.course_instance_id = e.course_instance_id AND a.id = assessment_groups_add_member.assessment_id
    WHERE u.uid = arg_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User does not exist or is not enrolled in this course instance: %', arg_uid;
    END IF;

    -- ##################################################################
    -- insert group_user
    WITH log AS (
        INSERT INTO group_users (group_id, user_id)
        VALUES (arg_gid, arg_user_id)
        RETURNING group_id
    )
    INSERT INTO group_logs 
        (authn_user_id, user_id, group_id, action)
    SELECT assessment_groups_add_member.authn_user_id, arg_user_id, group_id, 'join'
    FROM log;

END;
$$ LANGUAGE plpgsql VOLATILE;
