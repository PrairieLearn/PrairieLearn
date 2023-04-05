CREATE FUNCTION
    users_is_instructor_in_any_course (
        IN user_id bigint,
        OUT is_instructor boolean
    )
AS $$
BEGIN
    -- returns TRUE if the user is on the course staff of any course

    PERFORM
        *
    FROM
        users AS u
        LEFT JOIN administrators AS adm ON adm.user_id = u.user_id
        LEFT JOIN course_permissions AS cp ON (cp.user_id = u.user_id)
        LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id)
        LEFT JOIN pl_courses AS c ON (c.id = cp.course_id)
        LEFT JOIN course_instances AS ci ON (ci.id = cip.course_instance_id AND ci.course_id = c.id)
    WHERE
        u.user_id = users_is_instructor_in_any_course.user_id
        AND (
            adm.id IS NOT NULL
            OR (
                (cp.course_role > 'None' OR cip.course_instance_role > 'None')
                AND (c.deleted_at IS NULL AND ci.deleted_at IS NULL)
            )
        );

    is_instructor := FOUND;
END;
$$ LANGUAGE plpgsql STABLE;
