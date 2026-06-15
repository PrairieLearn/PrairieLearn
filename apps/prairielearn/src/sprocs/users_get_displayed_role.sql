CREATE FUNCTION
    users_get_displayed_role (
        IN user_id bigint,
        IN course_instance_id bigint,
        OUT displayed_role text
    )
AS $$
BEGIN
    IF
        users_is_instructor_in_course_instance(user_id, course_instance_id)
    THEN
        displayed_role := 'Staff';
    ELSE
        PERFORM *
        FROM enrollments AS e
        WHERE
            e.user_id = users_get_displayed_role.user_id
            AND e.course_instance_id = users_get_displayed_role.course_instance_id;

        IF FOUND THEN displayed_role := 'Student';
        ELSE displayed_role := 'None';
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
