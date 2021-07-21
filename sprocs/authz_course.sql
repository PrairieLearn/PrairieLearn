CREATE FUNCTION
    authz_course(
        user_id bigint,
        course_id bigint,
        is_administrator boolean
    ) returns jsonb
AS $$
DECLARE
    course_role enum_course_role;
    permissions_course jsonb;
BEGIN
    SELECT cp.course_role INTO course_role
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = authz_course.user_id
        AND cp.course_id = authz_course.course_id;

    IF NOT FOUND THEN
        course_role := 'None';
    END IF;

    IF is_administrator THEN
        course_role := 'Owner';
    END IF;

    permissions_course := jsonb_build_object(
        'course_role', course_role,
        'has_course_permission_view', course_role >= 'Viewer',
        'has_course_permission_edit', course_role >= 'Editor',
        'has_course_permission_own', course_role >= 'Owner'
    );
    RETURN permissions_course;
END;
$$ LANGUAGE plpgsql VOLATILE;
