DROP FUNCTION IF EXISTS authz_course_instance(bigint,bigint,boolean);
DROP FUNCTION IF EXISTS authz_course_instance(bigint,bigint,boolean,timestamptz);

CREATE OR REPLACE FUNCTION
    authz_course_instance(
        user_id bigint,
        course_instance_id bigint,
        is_administrator boolean,
        req_date timestamptz,
        enroll_if_needed boolean
    ) returns jsonb
AS $$
DECLARE
    role enum_role;
    permissions_course_instance jsonb;
BEGIN

    IF enroll_if_needed THEN
        INSERT INTO enrollments AS e
                (user_id, course_instance_id, role)
        (
            SELECT
                u.user_id, authz_course_instance.course_instance_id, 'Student'
            FROM
                users AS u
            WHERE
                u.user_id = authz_course_instance.user_id
                AND check_course_instance_access(authz_course_instance.course_instance_id, 'Student', u.uid, u.institution_id, req_date)
        )
        ON CONFLICT DO NOTHING RETURNING e.role INTO role;
    END IF;

    IF NOT enroll_if_needed OR NOT FOUND THEN
        SELECT e.role INTO role
        FROM
            enrollments AS e
            JOIN users AS u ON (u.user_id = e.user_id)
        WHERE
            u.user_id = authz_course_instance.user_id
            AND e.course_instance_id = authz_course_instance.course_instance_id
            AND check_course_instance_access(authz_course_instance.course_instance_id, e.role, u.uid, u.institution_id, req_date);

        IF NOT FOUND THEN
            role := 'None';
        END IF;
    END IF;

    IF is_administrator THEN
        role := 'Instructor';
    END IF;

    permissions_course_instance := jsonb_build_object(
        'role', role,
        'has_instructor_view', role >= 'TA',
        'has_instructor_edit', role >= 'Instructor'
    );
    RETURN permissions_course_instance;
END;
$$ LANGUAGE plpgsql VOLATILE;
