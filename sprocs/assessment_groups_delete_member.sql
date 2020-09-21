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
    -- get user_id from uid and make sure the user enrolled in this assessment
    SELECT u.user_id
    INTO arg_user_id
    FROM 
        users AS u
        JOIN enrollments AS e ON e.user_id = u.user_id
        JOIN assessments AS a ON a.course_instance_id = e.course_instance_id AND a.id = assessment_groups_delete_member.assessment_id
    WHERE u.uid = arg_uid;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'This user does not exist or is not enrolled in this assessment';
    END IF;

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
