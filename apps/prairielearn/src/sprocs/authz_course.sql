CREATE FUNCTION
    authz_course(
        user_id bigint,
        course_id bigint,
        is_administrator boolean,
        allow_example_course_override boolean,
        req_course_role enum_course_role default NULL
    ) returns jsonb
AS $$
DECLARE
    course_role enum_course_role;
    permissions_course jsonb;
    is_example_course boolean;
BEGIN
    SELECT
        c.example_course
    INTO
        is_example_course
    FROM
        pl_courses AS c
    WHERE
        c.id = authz_course.course_id
        AND c.deleted_at IS NULL;

    SELECT
        cp.course_role
    INTO
        course_role
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = authz_course.user_id
        AND cp.course_id = authz_course.course_id;

    IF NOT FOUND THEN
        course_role := 'None';

        IF is_example_course AND allow_example_course_override THEN
            course_role := 'Viewer';
        END IF;
    END IF;

    PERFORM 1
    FROM
        institution_administrators AS ia
        JOIN institutions AS i ON (i.id = ia.institution_id)
        JOIN pl_courses AS c ON (c.institution_id = i.id)
    WHERE
        c.id = authz_course.course_id
        AND ia.user_id = authz_course.user_id;

    IF FOUND THEN
        course_role := 'Owner';
    END IF;

    IF is_administrator THEN
        course_role := 'Owner';
    END IF;

    IF req_course_role IS NOT NULL THEN
        course_role := req_course_role;
    END IF;

    permissions_course := jsonb_build_object(
        'course_role', course_role,
        'has_course_permission_preview', course_role >= 'Previewer',
        'has_course_permission_view', course_role >= 'Viewer',
        'has_course_permission_edit', course_role >= 'Editor',
        'has_course_permission_own', course_role >= 'Owner'
    );
    RETURN permissions_course;
END;
$$ LANGUAGE plpgsql VOLATILE;
