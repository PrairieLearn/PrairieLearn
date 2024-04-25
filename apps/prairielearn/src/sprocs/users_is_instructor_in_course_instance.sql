CREATE FUNCTION
    users_is_instructor_in_course_instance (
        IN user_id bigint,
        IN course_instance_id bigint,
        OUT is_instructor boolean
    )
AS $$
BEGIN
    -- returns TRUE if the user has either:
    --      (1) non-none course role for the course with the given course instance, or
    --      (2) non-none course instance role for the given course instance.
    --
    -- note: users_is_instructor_in_course_instance can return FALSE for some
    -- course instances even when users_is_instructor_in_course returns TRUE,
    -- because the latter function looks for a non-none course instance role
    -- for ANY course instance, not for a particular course instance

    PERFORM
        *
    FROM
        users AS u
        JOIN course_instances AS ci ON ci.id = users_is_instructor_in_course_instance.course_instance_id
        LEFT JOIN administrators AS adm ON adm.user_id = u.user_id
        LEFT JOIN course_permissions AS cp ON (cp.user_id = u.user_id AND cp.course_id = ci.course_id)
        LEFT JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id AND cip.course_instance_id = ci.id)
    WHERE
        u.user_id = users_is_instructor_in_course_instance.user_id
        AND (
            adm.id IS NOT NULL
            OR cp.course_role > 'None'
            OR cip.course_instance_role > 'None'
        );

    is_instructor := FOUND;
END;
$$ LANGUAGE plpgsql STABLE;
