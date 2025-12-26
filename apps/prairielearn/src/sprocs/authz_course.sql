CREATE FUNCTION
    authz_course(
        user_id bigint,
        course_id bigint
    ) RETURNS jsonb
AS $$
DECLARE
    course_role enum_course_role;
    permissions_course jsonb;
BEGIN
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
    END IF;

    PERFORM 1
    FROM
        institution_administrators AS ia
        JOIN institutions AS i ON (i.id = ia.institution_id)
        JOIN courses AS c ON (c.institution_id = i.id)
    WHERE
        c.id = authz_course.course_id
        AND ia.user_id = authz_course.user_id;

    IF FOUND THEN
        course_role := 'Owner';
    END IF;

    permissions_course := jsonb_build_object(
        'course_role', course_role
    );
    RETURN permissions_course;
END;
$$ LANGUAGE plpgsql VOLATILE;
