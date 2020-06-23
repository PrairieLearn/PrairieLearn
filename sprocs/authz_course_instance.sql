DROP FUNCTION IF EXISTS authz_course_instance(bigint,bigint,boolean);
DROP FUNCTION IF EXISTS authz_course_instance(bigint,bigint,boolean,timestamptz);
DROP FUNCTION IF EXISTS authz_course_instance(bigint,bigint,boolean,timestamptz,enum_course_instance_role);

CREATE OR REPLACE FUNCTION
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
    is_enrolled_with_access boolean;
BEGIN
    SELECT cip.course_instance_role INTO course_instance_role
    FROM
        course_permissions AS cp
        JOIN course_instance_permissions AS cip ON (cip.course_permission_id = cp.id AND cip.course_instance_id = authz_course_instance.course_instance_id)
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

    PERFORM
        *
    FROM
        enrollments AS e
        JOIN users AS u ON (u.user_id = e.user_id)
    WHERE
        u.user_id = authz_course_instance.user_id
        AND e.course_instance_id = authz_course_instance.course_instance_id
        AND check_course_instance_access(authz_course_instance.course_instance_id, u.uid, u.institution_id, req_date);

    is_enrolled_with_access := FOUND;

    permissions_course_instance := jsonb_build_object(
        'course_instance_role', course_instance_role,
        'has_course_instance_permission_view', course_instance_role >= 'Student Data Viewer',
        'has_course_instance_permission_edit', course_instance_role >= 'Student Data Editor',
        'is_enrolled_with_access', is_enrolled_with_access
    );
    RETURN permissions_course_instance;
END;
$$ LANGUAGE plpgsql VOLATILE;
