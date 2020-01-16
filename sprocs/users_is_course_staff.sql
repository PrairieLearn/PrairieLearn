DROP FUNCTION IF EXISTS users_is_course_staff(bigint);

CREATE OR REPLACE FUNCTION
    users_is_course_staff (
        IN user_id bigint,
        OUT is_course_staff boolean
    )
AS $$
BEGIN
    -- returns TRUE if the user is course staff in any course

    PERFORM *
    FROM
        users AS u
        LEFT JOIN course_permissions AS cp USING (user_id)
        LEFT JOIN enrollments AS e USING (user_id)
        LEFT JOIN administrators AS adm USING (user_id)
    WHERE
        u.user_id = users_is_course_staff.user_id
        AND (
            cp.course_role > 'None'
            OR e.role > 'Student'
            OR adm.id IS NOT NULL
        );

    is_course_staff := FOUND;
END;
$$ LANGUAGE plpgsql VOLATILE;
