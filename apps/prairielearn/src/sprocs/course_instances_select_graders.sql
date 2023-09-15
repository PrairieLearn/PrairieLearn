CREATE FUNCTION
    course_instances_select_graders(
        IN arg_course_instance_id bigint,
        OUT user_list users[]
    )
AS $$
BEGIN
    SELECT array_agg(u) INTO user_list
    FROM
        course_instances AS ci
        JOIN course_instance_permissions AS cip ON (cip.course_instance_id = ci.id)
        JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
        JOIN users AS u ON (u.user_id = cp.user_id)
    WHERE
        ci.id = arg_course_instance_id
        AND cip.course_instance_role >= 'Student Data Editor';
END;
$$ LANGUAGE plpgsql STABLE;

