DROP FUNCTION IF EXISTS check_course_instance_access(bigint, enum_role, text, timestamptz);
DROP FUNCTION IF EXISTS check_course_instance_access(bigint, enum_role, text, bigint, timestamptz);

CREATE OR REPLACE FUNCTION
    check_course_instance_access (
        course_instance_id bigint,
        role enum_role,
        uid text,
        institution_id bigint,
        date timestamptz
    ) RETURNS boolean AS $$
SELECT
    CASE
        WHEN check_course_instance_access.role >= 'Instructor' THEN TRUE
        ELSE (
            SELECT
                COALESCE(bool_or(
                    check_course_instance_access_rule(ciar, check_course_instance_access.role,
                        check_course_instance_access.uid, check_course_instance_access.institution_id,
                        check_course_instance_access.date)
                ), FALSE)
            FROM
                course_instance_access_rules AS ciar
            WHERE
                ciar.course_instance_id = check_course_instance_access.course_instance_id
        )
    END;
$$ LANGUAGE SQL STABLE;
