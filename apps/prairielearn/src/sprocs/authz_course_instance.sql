CREATE FUNCTION
    authz_course_instance(
        user_id bigint,
        course_instance_id bigint,
        is_administrator boolean,
        req_date timestamptz,
        req_course_instance_role enum_course_instance_role default NULL
    ) returns jsonb
AS $$
DECLARE
    course_instance_role enum_course_instance_role;
    permissions_course_instance jsonb;
    has_student_access boolean;
    has_student_access_with_enrollment boolean;
BEGIN
    SELECT
        cip.course_instance_role
    INTO
        course_instance_role
    FROM
        course_permissions AS cp
        JOIN course_instance_permissions AS cip ON (
            cip.course_permission_id = cp.id
            AND cip.course_instance_id = authz_course_instance.course_instance_id
        )
    WHERE
        cp.user_id = authz_course_instance.user_id;

    IF NOT FOUND THEN
        course_instance_role := 'None';
    END IF;

    IF is_administrator THEN
        course_instance_role := 'Student Data Editor';
    END IF;

    IF req_course_instance_role IS NOT NULL THEN
        course_instance_role := req_course_instance_role;
    END IF;

    -- Check if the user has access to the course instance as a student
    SELECT
        check_course_instance_access(authz_course_instance.course_instance_id, u.uid, u.institution_id, req_date)
    INTO
        has_student_access
    FROM
        users AS u
    WHERE
        u.user_id = authz_course_instance.user_id;

    IF FOUND AND (has_student_access IS TRUE) THEN

        -- The user has student access - check if they are also enrolled
        PERFORM
            *
        FROM
            enrollments AS e
        WHERE
            e.user_id = authz_course_instance.user_id
            AND e.course_instance_id = authz_course_instance.course_instance_id;

        has_student_access_with_enrollment := FOUND;

    ELSE

        -- The user does not have student access - so, consequently, they do not
        -- have student access with enrollment, whether or not they are enrolled
        has_student_access_with_enrollment := FALSE;

        -- The other way to end up here is if the user did not exist - this should
        -- never happen, but just in case, we make sure has_student_access is FALSE
        -- and not NULL
        has_student_access := FALSE;

    END IF;

    permissions_course_instance := jsonb_build_object(
        'course_instance_role', course_instance_role,
        'has_course_instance_permission_view', course_instance_role >= 'Student Data Viewer',
        'has_course_instance_permission_edit', course_instance_role >= 'Student Data Editor',
        'has_student_access', has_student_access,
        'has_student_access_with_enrollment', has_student_access_with_enrollment
    );
    RETURN permissions_course_instance;
END;
$$ LANGUAGE plpgsql VOLATILE;
