CREATE FUNCTION
    course_permissions_delete(
        course_id bigint,
        user_id bigint,
        authn_user_id bigint
    ) returns void
AS $$
DECLARE
    old_row course_permissions%ROWTYPE;
BEGIN
    DELETE FROM course_permissions AS cp
    WHERE
        cp.course_id = course_permissions_delete.course_id
        AND cp.user_id = course_permissions_delete.user_id
    RETURNING
        cp.* INTO old_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'could not find course_permission';
    END IF;

    INSERT INTO audit_logs
        (authn_user_id, course_id, user_id,  table_name,          row_id,
        action,  old_state)
    VALUES
        (authn_user_id, course_id, user_id, 'course_permissions', old_row.id,
        'delete', to_jsonb(old_row));

    -- Delete all enrollments of this user from instances of the course, for two
    -- reasons:
    --
    --  1) So they will still be ignored when computing statistics. Only users who
    --     are enrolled and who do not have access to course content or student data
    --     are considered when computing statistics.
    --
    --  2) So their role, displayed in the list of assessment instances, will change
    --     from "Staff" to "None" instead of to "Student".
    --
    DELETE FROM enrollments AS e
    USING
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id AND c.id = course_permissions_delete.course_id)
    WHERE
        e.user_id = course_permissions_delete.user_id
        AND e.course_instance_id = ci.id;
END;
$$ LANGUAGE plpgsql VOLATILE;
